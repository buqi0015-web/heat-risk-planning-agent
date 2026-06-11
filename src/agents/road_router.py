from __future__ import annotations

import math
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree


def clean_string(value: object) -> str:
    return "" if pd.isna(value) else str(value)


ENVIRONMENT_FIELDS = [
    "lst",
    "tree_canopy_cover",
    "pedestrian_shade_cover",
    "distance_to_water_m",
    "effective_heat_stress",
]


def clean_number(value: object, default: float = 0.0) -> float:
    number = pd.to_numeric(value, errors="coerce")
    return default if pd.isna(number) else float(number)


class RoadRouter:
    def __init__(self, edges_path: Path, environment_path: Path | None = None) -> None:
        edges = pd.read_csv(edges_path, low_memory=False)
        if environment_path is not None and environment_path.exists():
            environment = pd.read_csv(environment_path, low_memory=False)
            available = [field for field in ENVIRONMENT_FIELDS if field in environment.columns]
            edges = edges.merge(environment[["edge_id", *available]], on="edge_id", how="left")
        self.environment_available = any(
            field in edges.columns and pd.to_numeric(edges[field], errors="coerce").notna().any()
            for field in ENVIRONMENT_FIELDS
        )
        self.graph = nx.Graph()
        for row in edges.itertuples(index=False):
            record = row._asdict()
            self.graph.add_edge(
                str(row.from_node),
                str(row.to_node),
                length_m=float(row.length_m),
                edge_id=clean_string(row.edge_id),
                osm_id=clean_string(row.osm_id),
                fclass=clean_string(row.fclass),
                fclass_cn=clean_string(row.fclass_cn),
                road_type=clean_string(row.road_type),
                road_name=clean_string(row.road_name),
                oneway=clean_string(row.oneway),
                maxspeed=clean_string(row.maxspeed),
                **{field: clean_number(record.get(field), math.nan) for field in ENVIRONMENT_FIELDS},
            )
        self.nodes = list(self.graph.nodes)
        self.coordinates = np.array([[float(part) for part in node.split(",")] for node in self.nodes], dtype="float64")
        self.tree = cKDTree(self.coordinates)

    def nearest_node(self, lon: float, lat: float) -> tuple[str, float]:
        distance_degrees, index = self.tree.query([lon, lat], k=1)
        return self.nodes[int(index)], float(distance_degrees) * 111_000

    @staticmethod
    def node_coordinates(node: str) -> tuple[float, float]:
        lon, lat = node.split(",")
        return float(lon), float(lat)

    def route(
        self,
        origin_lon: float,
        origin_lat: float,
        destination_lon: float,
        destination_lat: float,
        preference: dict[str, float | str] | None = None,
        cost_mode: str = "distance",
    ) -> tuple[float, str, list[dict[str, object]]]:
        origin_node, origin_snap_m = self.nearest_node(origin_lon, origin_lat)
        destination_node, destination_snap_m = self.nearest_node(destination_lon, destination_lat)
        use_environment = cost_mode == "environment" and self.environment_available and preference is not None

        def edge_cost(_: str, __: str, attributes: dict[str, object]) -> float:
            length = float(attributes.get("length_m", 0.0))
            if not use_environment:
                return length
            heat = clean_number(attributes.get("effective_heat_stress"), math.nan)
            if math.isnan(heat):
                lst = clean_number(attributes.get("lst"), math.nan)
                # Missing heat data receives a conservative penalty so routes do not
                # appear cooler merely because environmental coverage is absent.
                heat = 0.70 if math.isnan(lst) else min(1.0, max(0.0, (lst - 25.0) / 20.0))
            canopy = clean_number(attributes.get("tree_canopy_cover"), 0.0)
            if canopy > 1:
                canopy /= 100.0
            shade = clean_number(attributes.get("pedestrian_shade_cover"), canopy)
            if shade > 1:
                shade /= 100.0
            water_distance = clean_number(attributes.get("distance_to_water_m"), 1000.0)
            shade_deficit = 1.0 - min(1.0, max(canopy, shade))
            water_penalty = min(1.0, max(0.0, water_distance / 1000.0))
            multiplier = (
                float(preference.get("distance_weight", 1.0))
                + float(preference.get("heat_weight", 0.0)) * heat
                + float(preference.get("shade_deficit_weight", 0.0)) * shade_deficit
                + float(preference.get("water_distance_weight", 0.0)) * water_penalty
            )
            return length * max(multiplier, 0.05)

        try:
            path = nx.shortest_path(self.graph, origin_node, destination_node, weight=edge_cost)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return math.inf, "road_network_no_path", []

        segments: list[dict[str, object]] = []
        origin_node_lon, origin_node_lat = self.node_coordinates(origin_node)
        if origin_snap_m > 0:
            segments.append(
                {
                    "segment_type": "access_connector",
                    "edge_id": "origin_access_connector",
                    "osm_id": "",
                    "fclass": "",
                    "fclass_cn": "",
                    "road_type": "",
                    "road_name": "",
                    "oneway": "",
                    "maxspeed": "",
                    "from_node": "activity_origin",
                    "to_node": origin_node,
                    "from_lon": origin_lon,
                    "from_lat": origin_lat,
                    "to_lon": origin_node_lon,
                    "to_lat": origin_node_lat,
                    "length_m": origin_snap_m,
                }
            )

        for from_node, to_node in zip(path, path[1:]):
            attributes = self.graph.get_edge_data(from_node, to_node) or {}
            from_lon, from_lat = self.node_coordinates(from_node)
            to_lon, to_lat = self.node_coordinates(to_node)
            segments.append(
                {
                    "segment_type": "road_edge",
                    "edge_id": attributes.get("edge_id", ""),
                    "osm_id": attributes.get("osm_id", ""),
                    "fclass": attributes.get("fclass", ""),
                    "fclass_cn": attributes.get("fclass_cn", ""),
                    "road_type": attributes.get("road_type", ""),
                    "road_name": attributes.get("road_name", ""),
                    "oneway": attributes.get("oneway", ""),
                    "maxspeed": attributes.get("maxspeed", ""),
                    "from_node": from_node,
                    "to_node": to_node,
                    "from_lon": from_lon,
                    "from_lat": from_lat,
                    "to_lon": to_lon,
                    "to_lat": to_lat,
                    "length_m": float(attributes.get("length_m", 0.0)),
                    **{field: attributes.get(field, math.nan) for field in ENVIRONMENT_FIELDS},
                    "generalized_cost": edge_cost(from_node, to_node, attributes),
                }
            )

        destination_node_lon, destination_node_lat = self.node_coordinates(destination_node)
        if destination_snap_m > 0:
            segments.append(
                {
                    "segment_type": "access_connector",
                    "edge_id": "destination_access_connector",
                    "osm_id": "",
                    "fclass": "",
                    "fclass_cn": "",
                    "road_type": "",
                    "road_name": "",
                    "oneway": "",
                    "maxspeed": "",
                    "from_node": destination_node,
                    "to_node": "activity_destination",
                    "from_lon": destination_node_lon,
                    "from_lat": destination_node_lat,
                    "to_lon": destination_lon,
                    "to_lat": destination_lat,
                    "length_m": destination_snap_m,
                }
            )

        total_distance = sum(float(segment["length_m"]) for segment in segments)
        method = "road_network_environment_aware_path" if use_environment else "road_network_shortest_path_edges"
        return total_distance, method, segments

    def route_distance(self, origin_lon: float, origin_lat: float, destination_lon: float, destination_lat: float) -> tuple[float, str]:
        distance, method, _ = self.route(origin_lon, origin_lat, destination_lon, destination_lat)
        return distance, method
