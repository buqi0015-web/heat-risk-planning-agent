from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Any

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.agents.behavior_model import ALLOWED_ACTIONS, HeatDecisionContext, action_probabilities, choose_action
from src.agents.activity_calibration import (
    apply_public_stats_calibration,
    attach_calibration_weight,
    load_calibration_config,
    weighted_summary,
)
from src.agents.activity_rules import (
    ACTIVITY_NECESSITY_BY_PURPOSE,
    TRIP_PURPOSES_BY_AGENT,
    behavior_reason,
    facility_needs,
    failure_zone,
    max_destination_distance_m,
    overlap_minutes,
    sample_departure_time,
    sample_dwell_minutes,
    suitable_facility_types,
)
from src.agents.deepseek_decision import choose_action_with_deepseek, load_env_file
from src.agents.personas import RESIDENT_PERSONAS
from src.agents.path_preferences import sample_path_preference
from src.agents.road_router import RoadRouter
from src.agents.trip_behavior import TRIP_BEHAVIORS
from src.failure_detection.exposure import cumulative_heat_exposure
from src.failure_detection.weather_modifier import HourlyWeatherModifier


DESTINATION_GROUPS_BY_TRIP_TYPE = {
    "fixed_time_necessary": ["children_related", "transit", "health_support"],
    "flexible_necessary": ["meal_grocery", "health_support"],
    "leisure": ["green_blue", "cooling_potential"],
    "outdoor_work": ["outdoor_worker_support", "transit"],
    "accompanied_trip": ["health_support", "children_related", "green_blue"],
}

VULNERABILITY_BY_AGENT = {
    "elderly_living_alone": 1.5,
    "elderly_chronic_disease": 1.7,
    "child_parent": 1.2,
    "university_student": 1.0,
    "household_maintainer": 1.1,
    "outdoor_worker": 1.4,
    "commuter": 1.0,
}

ORIGIN_WEIGHT_BY_AGENT = {
    "elderly_living_alone": "elderly_living_alone_weight",
    "elderly_chronic_disease": "elderly_chronic_disease_weight",
    "child_parent": "child_parent_weight",
    "university_student": "university_student_weight",
    "household_maintainer": "household_maintainer_weight",
    "outdoor_worker": "outdoor_worker_weight",
    "commuter": "commuter_weight",
}

DESTINATION_GROUPS_BY_PURPOSE = {
    "接送儿童": ["children_related"],
    "高校通学": ["children_related", "transit"],
    "校园活动": ["children_related", "green_blue", "cooling_potential"],
    "通勤接驳": ["transit"],
    "预约就医": ["health_support"],
    "买菜": ["meal_grocery"],
    "买药": ["health_support"],
    "助餐": ["meal_grocery"],
    "散步": ["green_blue"],
    "公园活动": ["green_blue"],
    "短时购物": ["meal_grocery"],
    "配送": ["outdoor_worker_support", "meal_grocery"],
    "快递": ["outdoor_worker_support", "residential_origins"],
    "巡查": ["outdoor_worker_support", "transit"],
    "陪老人就医": ["health_support"],
    "带儿童活动": ["children_related", "green_blue"],
}

PURPOSE_ALLOWED_MAIN_CATEGORIES = {
    "接送儿童": {"科教文化服务"},
    "高校通学": {"科教文化服务"},
    "校园活动": {"科教文化服务", "风景名胜"},
    "通勤接驳": {"交通设施服务"},
    "预约就医": {"医疗保健服务"},
    "买菜": {"购物服务"},
    "买药": {"医疗保健服务", "购物服务"},
    "助餐": {"餐饮服务", "购物服务", "生活服务"},
    "散步": {"风景名胜", "公共设施"},
    "公园活动": {"风景名胜"},
    "短时购物": {"购物服务"},
    "陪老人就医": {"医疗保健服务"},
    "带儿童活动": {"科教文化服务", "风景名胜"},
    "配送": {"购物服务", "餐饮服务", "生活服务", "商务住宅", "公司企业"},
    "快递": {"生活服务", "商务住宅", "公司企业"},
    "巡查": {"公共设施", "交通设施服务", "汽车服务", "政府机构及社会团体"},
}

ACTIVITIES_BY_GROUP = {
    "children_related": ["接送儿童", "带儿童活动", "高校通学", "校园活动"],
    "transit": ["通勤接驳", "高校通学"],
    "health_support": ["预约就医", "买药", "陪老人就医"],
    "meal_grocery": ["买菜", "助餐", "短时购物"],
    "green_blue": ["散步", "公园活动", "带儿童活动", "校园活动"],
    "cooling_potential": ["散步", "公园活动", "短时购物", "助餐", "校园活动"],
    "outdoor_worker_support": ["配送", "快递", "巡查"],
    "residential_origins": ["居住出发"],
}

TARGET_AGENTS_BY_GROUP = {
    "children_related": ["child_parent", "university_student", "household_maintainer"],
    "transit": ["commuter", "university_student", "child_parent"],
    "health_support": ["elderly_chronic_disease", "elderly_living_alone", "household_maintainer"],
    "meal_grocery": ["elderly_living_alone", "household_maintainer", "university_student"],
    "green_blue": ["elderly_living_alone", "child_parent", "household_maintainer", "university_student"],
    "cooling_potential": ["elderly_living_alone", "elderly_chronic_disease", "outdoor_worker", "household_maintainer"],
    "outdoor_worker_support": ["outdoor_worker"],
    "residential_origins": ["commuter", "household_maintainer"],
}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_env_table(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    if "lon" not in df.columns or "lat" not in df.columns:
        raise ValueError(f"{path} must contain lon and lat columns")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    return df.dropna(subset=["lon", "lat"]).reset_index(drop=True)


def assign_facility_ids(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    copied = df.copy().reset_index(drop=True)
    source_rows = copied.get("source_row", pd.Series(range(len(copied))))
    ids = []
    for idx, source_row in enumerate(source_rows):
        raw = "" if pd.isna(source_row) else str(source_row).split(".")[0]
        suffix = raw if raw else str(idx + 1)
        ids.append(f"{prefix}_{suffix}")
    copied["facility_id"] = ids
    return copied


def split_groups(value: Any) -> list[str]:
    if pd.isna(value):
        return []
    return [item for item in str(value).split(";") if item]


def infer_supported_activities(groups: list[str]) -> list[str]:
    activities: list[str] = []
    for group in groups:
        for activity in ACTIVITIES_BY_GROUP.get(group, []):
            if activity not in activities:
                activities.append(activity)
    return activities


def infer_target_agents(groups: list[str]) -> list[str]:
    agents: list[str] = []
    for group in groups:
        for agent in TARGET_AGENTS_BY_GROUP.get(group, []):
            if agent not in agents:
                agents.append(agent)
    return agents


def build_facilities_table(destinations: pd.DataFrame, candidates: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    tables = [("destination", destinations), ("cooling_candidate", candidates)]
    seen: set[tuple[str, float, float]] = set()
    for role, table in tables:
        for row in table.itertuples(index=False):
            record = row._asdict()
            lon = round(float(record.get("lon", 0.0)), 7)
            lat = round(float(record.get("lat", 0.0)), 7)
            key = (str(record.get("poi_name", "")), lon, lat)
            if key in seen:
                continue
            seen.add(key)
            groups = split_groups(record.get("poi_groups", ""))
            is_core = str(record.get("is_core_cooling_candidate", "")).lower() == "true"
            is_support = str(record.get("is_support_cooling_candidate", "")).lower() == "true"
            rows.append(
                {
                    "facility_id": record.get("facility_id", ""),
                    "facility_name": record.get("poi_name", ""),
                    "facility_type": record.get("poi_type", ""),
                    "source_role": role,
                    "lon": lon,
                    "lat": lat,
                    "poi_groups": ";".join(groups),
                    "activity_supported": ";".join(infer_supported_activities(groups)),
                    "cooling_function": record.get("reuse_functions", ""),
                    "capacity_proxy": record.get("publicness", ""),
                    "open_time": "unknown",
                    "reuse_potential": "core" if is_core else "support" if is_support else "destination_only",
                    "target_agents": ";".join(infer_target_agents(groups)),
                    "conflict_risk": record.get("conflict_risk", ""),
                }
            )
    return pd.DataFrame(rows)


def read_optional_origin_units(path: Path) -> pd.DataFrame | None:
    if not path.exists():
        return None
    df = read_env_table(path)
    if "in_haidian" in df.columns:
        df = df[df["in_haidian"].astype(str).str.lower().isin(["true", "1"])]
    return df.reset_index(drop=True)


def groups_contain(series: pd.Series, groups: list[str]) -> pd.Series:
    group_set = set(groups)
    return series.fillna("").astype(str).str.split(";").apply(lambda values: bool(group_set.intersection(values)))


def contains_any(series: pd.Series, keywords: list[str]) -> pd.Series:
    if not keywords:
        return pd.Series(True, index=series.index)
    pattern = "|".join(keywords)
    return series.fillna("").astype(str).str.contains(pattern, regex=True)


def purpose_semantic_mask(destinations: pd.DataFrame, purpose: str) -> pd.Series:
    mask = pd.Series(True, index=destinations.index)
    allowed_categories = PURPOSE_ALLOWED_MAIN_CATEGORIES.get(purpose)
    if allowed_categories and "main_category" in destinations.columns:
        mask &= destinations["main_category"].isin(allowed_categories)

    name = destinations.get("poi_name", pd.Series("", index=destinations.index))
    mid = destinations.get("mid_category", pd.Series("", index=destinations.index))
    sub = destinations.get("sub_category", pd.Series("", index=destinations.index))
    detail = name.fillna("").astype(str) + " " + mid.fillna("").astype(str) + " " + sub.fillna("").astype(str)

    if purpose in {"高校通学", "校园活动"}:
        mask &= contains_any(name, ["大学", "学院", "高校", "校区", "研究生", "实验楼", "教学楼"])
        mask &= ~contains_any(name, ["幼儿园", "小学", "中学", "培训学校", "职业技能"])
    elif purpose == "接送儿童":
        mask &= contains_any(name, ["幼儿园", "小学", "中学", "学校", "校区"])
    elif purpose in {"预约就医", "陪老人就医"}:
        mask &= contains_any(mid, ["综合医院", "专科医院", "诊所", "医疗保健服务场所", "疾病预防机构", "急救中心"])
        mask &= ~contains_any(detail, ["美容", "兽医", "宠物", "药房", "药店", "助听器", "护士楼", "医疗器械", "核酸", "养生", "生发"])
    elif purpose == "买药":
        mask &= contains_any(mid, ["医药保健销售店"])
        mask &= contains_any(name, ["药", "医药", "大药房"])
        mask &= ~contains_any(name, ["助听器", "体验馆", "蜂蜜", "蜜蜂"])
    elif purpose == "买菜":
        mask &= contains_any(detail, ["菜", "生鲜", "市场", "超市", "果蔬", "粮油", "便利"])
    elif purpose == "助餐":
        dining = destinations.get(
            "main_category", pd.Series("", index=destinations.index)
        ).eq("餐饮服务")
        named_meal_service = contains_any(name, ["餐厅", "饭店", "食堂", "助餐", "主食厨房", "快餐"])
        mask &= dining | named_meal_service
        mask &= ~contains_any(name, ["非餐", "餐具"])
    elif purpose == "公园活动":
        mask &= contains_any(name, ["公园", "园", "景区", "植物园", "动物园"])
    elif purpose == "快递":
        mask &= contains_any(mid, ["物流速递", "邮局"])
    elif purpose == "配送":
        mask &= contains_any(mid, ["物流速递", "综合市场", "超级市场", "便民商店/便利店", "餐饮"])
    return mask


def choose_origin(agent_type: str, poi_origins: pd.DataFrame, population_origins: pd.DataFrame | None, rng: random.Random) -> pd.Series:
    if population_origins is None or population_origins.empty:
        return poi_origins.iloc[rng.randrange(len(poi_origins))]
    eligible_origins = population_origins
    if "euluc_origin_eligible" in eligible_origins.columns:
        eligible_mask = eligible_origins["euluc_origin_eligible"].astype(str).str.lower().isin(["true", "1"])
        if eligible_mask.any():
            eligible_origins = eligible_origins[eligible_mask]
    weight_col = ORIGIN_WEIGHT_BY_AGENT[agent_type]
    if weight_col not in eligible_origins.columns:
        return poi_origins.iloc[rng.randrange(len(poi_origins))]
    weights = pd.to_numeric(eligible_origins[weight_col], errors="coerce").fillna(0.0)
    total = float(weights.sum())
    if total <= 0:
        return poi_origins.iloc[rng.randrange(len(poi_origins))]
    threshold = rng.random() * total
    cumulative = 0.0
    for idx, weight in weights.items():
        cumulative += float(weight)
        if threshold <= cumulative:
            return eligible_origins.loc[idx]
    return eligible_origins.iloc[-1]


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def choose_destination(
    destinations: pd.DataFrame,
    trip_type: str,
    purpose: str,
    origin: pd.Series,
    rng: random.Random,
    sample_size: int,
    distance_decay_m: float,
) -> pd.Series:
    groups = DESTINATION_GROUPS_BY_PURPOSE.get(purpose, DESTINATION_GROUPS_BY_TRIP_TYPE[trip_type])
    grouped = destinations[groups_contain(destinations["poi_groups"], groups)]
    semantic = grouped
    semantic = semantic[purpose_semantic_mask(semantic, purpose)]
    euluc_spatial = semantic
    if "euluc_supported_purposes" in euluc_spatial.columns:
        euluc_spatial = euluc_spatial[
            euluc_spatial["euluc_supported_purposes"]
            .fillna("")
            .astype(str)
            .str.split(";")
            .apply(lambda values: purpose in values)
        ]
    road_spatial = semantic
    if "road_access_eligible" in road_spatial.columns:
        road_spatial = road_spatial[
            road_spatial["road_access_eligible"].astype(str).str.lower().isin(["true", "1"])
        ]
    origin_component = origin.get("road_component_id", None)
    if origin_component is not None and "road_component_id" in road_spatial.columns:
        road_spatial = road_spatial[
            pd.to_numeric(road_spatial["road_component_id"], errors="coerce")
            == float(origin_component)
        ]
    full_spatial = euluc_spatial[euluc_spatial.index.isin(road_spatial.index)]

    if not full_spatial.empty:
        subset = full_spatial
        selection_rule = "poi_group+purpose_semantics+euluc_context+road_access"
    elif not road_spatial.empty:
        subset = road_spatial
        selection_rule = "poi_group+purpose_semantics+road_access"
    elif not euluc_spatial.empty:
        subset = euluc_spatial
        selection_rule = "poi_group+purpose_semantics+euluc_context"
    elif not semantic.empty:
        subset = semantic
        selection_rule = "poi_group+purpose_semantics"
    elif not grouped.empty:
        subset = grouped
        selection_rule = "poi_group_only_fallback"
    else:
        subset = destinations
        selection_rule = "all_destinations_fallback"
    sample = subset.sample(min(sample_size, len(subset)), random_state=rng.randrange(10_000_000))
    distances = sample.apply(
        lambda row: haversine_m(float(origin["lon"]), float(origin["lat"]), float(row["lon"]), float(row["lat"])),
        axis=1,
    )
    feasible = distances <= max_destination_distance_m(purpose)
    if feasible.any():
        sample = sample.loc[feasible]
        distances = distances.loc[feasible]
    else:
        all_distances = subset.apply(
            lambda row: haversine_m(
                float(origin["lon"]),
                float(origin["lat"]),
                float(row["lon"]),
                float(row["lat"]),
            ),
            axis=1,
        )
        all_feasible = all_distances <= max_destination_distance_m(purpose)
        if all_feasible.any():
            feasible_subset = subset.loc[all_feasible]
            sample = feasible_subset.sample(
                min(sample_size, len(feasible_subset)),
                random_state=rng.randrange(10_000_000),
            )
            distances = all_distances.loc[sample.index]
            selection_rule += "+expanded_feasible_search"
        else:
            nearest_index = all_distances.idxmin()
            selected = subset.loc[nearest_index].copy()
            selected["destination_selection_rule"] = selection_rule + "+nearest_distance_fallback"
            return selected
    weights = distances.apply(lambda value: math.exp(-float(value) / max(distance_decay_m, 1.0)))
    total = weights.sum()
    if total <= 0:
        return sample.iloc[rng.randrange(len(sample))]
    threshold = rng.random() * total
    cumulative = 0.0
    for index, weight in weights.items():
        cumulative += float(weight)
        if threshold <= cumulative:
            selected = sample.loc[index].copy()
            selected["destination_selection_rule"] = selection_rule
            return selected
    selected = sample.iloc[-1].copy()
    selected["destination_selection_rule"] = selection_rule
    return selected


def nearest_candidate(origin: pd.Series, destination: pd.Series, candidates: pd.DataFrame, sample_size: int, rng: random.Random):
    if candidates.empty:
        return None, math.inf
    sample = candidates.sample(min(sample_size, len(candidates)), random_state=rng.randrange(10_000_000))
    mid_lon = (float(origin["lon"]) + float(destination["lon"])) / 2
    mid_lat = (float(origin["lat"]) + float(destination["lat"])) / 2
    distances = sample.apply(lambda row: haversine_m(mid_lon, mid_lat, float(row["lon"]), float(row["lat"])), axis=1)
    idx = distances.idxmin()
    return sample.loc[idx], float(distances.loc[idx])


def intervention_match_score(trip_type: str, candidate: pd.Series | None) -> float:
    if candidate is None:
        return 0.0
    behavior = TRIP_BEHAVIORS[trip_type]
    text = f"{candidate.get('poi_name', '')} {candidate.get('poi_groups', '')} {candidate.get('reuse_functions', '')}"
    if any(item in text for item in behavior.suitable_interventions):
        return 1.0
    if "cooling_potential" in text:
        return 0.75 if trip_type in ["flexible_necessary", "leisure"] else 0.35
    if "outdoor_worker_support" in text:
        return 0.85 if trip_type == "outdoor_work" else 0.45
    if "transit" in text:
        return 0.7 if trip_type == "fixed_time_necessary" else 0.35
    return 0.4


def accessibility(distance_m: float, radius_m: float) -> float:
    if math.isinf(distance_m):
        return 0.0
    return max(0.0, min(1.0, 1.0 - distance_m / radius_m))


def parse_heat_period(period: str) -> tuple[int, int]:
    start, end = period.split("-")
    start_h, start_m = [int(part) for part in start.split(":")]
    end_h, end_m = [int(part) for part in end.split(":")]
    return start_h * 60 + start_m, end_h * 60 + end_m


def clock_from_minutes(minutes: float) -> str:
    rounded = int(round(minutes)) % (24 * 60)
    return f"{rounded // 60:02d}:{rounded % 60:02d}"


def activity_status(action: str, exposure: float, risky_threshold: float, failed_threshold: float) -> str:
    if action == "cancel" or exposure >= failed_threshold:
        return "failed"
    if action in ["delay", "substitute", "shorten", "add_stop"]:
        return "behavior_changed"
    if action == "risky_completion" or exposure >= risky_threshold:
        return "risky_completion"
    return "normal"


def after_facility_exposure(before_exposure: float, cooling_access: float, cooling_match: float, action: str) -> float:
    if action == "cancel":
        return before_exposure
    reduction_strength = 0.45 if action == "add_stop" else 0.25
    reduction = reduction_strength * cooling_access * cooling_match
    return before_exposure * max(0.0, 1.0 - reduction)


def finite_float(value: object, default: float) -> float:
    number = pd.to_numeric(value, errors="coerce")
    return default if pd.isna(number) or not math.isfinite(float(number)) else float(number)


def calculate_segment_exposure_metrics(
    path_segments: list[dict[str, Any]],
    departure_minute: float,
    heat_period: tuple[int, int],
    walk_speed_m_per_min: float,
    vulnerability_weight: float,
    fallback_heat_stress: float,
    high_heat_threshold: float,
    weather_modifier: HourlyWeatherModifier | None = None,
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    elapsed_minutes = 0.0
    route_exposure = 0.0
    route_heat_overlap = 0.0
    hazard_time_sum = 0.0
    hazard_heat_time_sum = 0.0
    maximum_hazard = 0.0
    road_length = 0.0
    observed_road_environment_length = 0.0
    high_heat_road_length = 0.0
    weather_factor_heat_time_sum = 0.0
    weather_temperature_heat_time_sum = 0.0
    weather_observed_minutes = 0.0
    running_route_exposure = 0.0
    prepared: list[dict[str, Any]] = []

    for segment in path_segments:
        length_m = float(segment.get("length_m", 0.0))
        travel_minutes = length_m / max(walk_speed_m_per_min, 1.0)
        segment_start = departure_minute + elapsed_minutes
        segment_end = segment_start + travel_minutes
        heat_overlap = overlap_minutes(segment_start, travel_minutes, heat_period)
        raw_hazard = pd.to_numeric(segment.get("effective_heat_stress"), errors="coerce")
        environment_observed = not pd.isna(raw_hazard) and math.isfinite(float(raw_hazard))
        spatial_hazard = max(0.0, min(1.0, float(raw_hazard))) if environment_observed else fallback_heat_stress
        weather = (
            weather_modifier.interval(segment_start, travel_minutes, heat_period)
            if weather_modifier is not None
            else None
        )
        weather_factor = weather.factor if weather is not None else 1.0
        hazard = max(0.0, min(1.0, spatial_hazard * weather_factor))
        exposure = cumulative_heat_exposure(
            heat_hazard=hazard,
            outdoor_minutes=heat_overlap,
            vulnerability_weight=vulnerability_weight,
        )

        if segment.get("segment_type") == "road_edge":
            road_length += length_m
            if environment_observed:
                observed_road_environment_length += length_m
            if hazard >= high_heat_threshold:
                high_heat_road_length += length_m
        route_exposure += exposure
        running_route_exposure += exposure
        route_heat_overlap += heat_overlap
        hazard_time_sum += hazard * travel_minutes
        hazard_heat_time_sum += hazard * heat_overlap
        maximum_hazard = max(maximum_hazard, hazard)
        if weather is not None and weather.observed_minutes > 0:
            weather_factor_heat_time_sum += weather.factor * weather.observed_minutes
            weather_temperature_heat_time_sum += weather.temperature_c * weather.observed_minutes
            weather_observed_minutes += weather.observed_minutes
        prepared.append(
            {
                **segment,
                "segment_start_minute": segment_start,
                "segment_end_minute": segment_end,
                "travel_minutes": travel_minutes,
                "heat_overlap_minutes": heat_overlap,
                "segment_spatial_heat_stress": spatial_hazard,
                "weather_factor": weather_factor,
                "weather_temperature_c": weather.temperature_c if weather is not None else "",
                "weather_relative_humidity_percent": (
                    weather.relative_humidity_percent if weather is not None else ""
                ),
                "weather_wind_speed_m_s": weather.wind_speed_m_s if weather is not None else "",
                "weather_solar_radiation_w_m2_proxy": (
                    weather.solar_radiation_w_m2_proxy if weather is not None else ""
                ),
                "weather_observed_minutes": weather.observed_minutes if weather is not None else 0.0,
                "segment_effective_heat_stress": hazard,
                "environment_observed": environment_observed,
                "environment_source": "road_environment" if environment_observed else "fallback_heat_stress",
                "segment_heat_exposure": exposure,
                "route_cumulative_exposure_at_segment_end": running_route_exposure,
            }
        )
        elapsed_minutes += travel_minutes

    return prepared, {
        "route_travel_minutes": elapsed_minutes,
        "route_heat_overlap_minutes": route_heat_overlap,
        "route_cumulative_heat_exposure": route_exposure,
        "route_mean_heat_stress": hazard_time_sum / elapsed_minutes if elapsed_minutes > 0 else fallback_heat_stress,
        "route_heat_period_mean_heat_stress": (
            hazard_heat_time_sum / route_heat_overlap if route_heat_overlap > 0 else 0.0
        ),
        "route_max_heat_stress": maximum_hazard,
        "high_heat_segment_length_share": high_heat_road_length / road_length if road_length > 0 else 0.0,
        "route_environment_coverage": (
            observed_road_environment_length / road_length if road_length > 0 else 0.0
        ),
        "route_weather_factor_mean": (
            weather_factor_heat_time_sum / weather_observed_minutes if weather_observed_minutes > 0 else 1.0
        ),
        "route_weather_temperature_mean_c": (
            weather_temperature_heat_time_sum / weather_observed_minutes if weather_observed_minutes > 0 else 0.0
        ),
        "route_weather_observed_minutes": weather_observed_minutes,
    }


def simulate(args: argparse.Namespace) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = random.Random(args.seed)
    env_dir = args.env_dir
    origins = assign_facility_ids(read_env_table(env_dir / "origins.csv"), "origin")
    population_origins = read_optional_origin_units(env_dir / "population_origin_units.csv")
    if population_origins is not None:
        population_origins = assign_facility_ids(population_origins, "pop_origin")
    destinations = assign_facility_ids(read_env_table(env_dir / "destinations.csv"), "dest")
    core = assign_facility_ids(read_env_table(env_dir / "core_cooling_candidates.csv"), "cool_core")
    support = assign_facility_ids(read_env_table(env_dir / "support_cooling_candidates.csv"), "cool_support")
    candidates = assign_facility_ids(pd.concat([core, support], ignore_index=True), "cool")
    facilities = build_facilities_table(destinations, candidates)
    heat_period = parse_heat_period(args.heat_period)
    weather_modifier = (
        HourlyWeatherModifier(args.weather_hourly, args.scenario_date)
        if args.weather_mode == "era5_hourly"
        else None
    )
    router = (
        RoadRouter(args.road_edges, args.road_environment)
        if args.route_mode == "road" and args.road_edges.exists()
        else None
    )

    rows: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    decision_logs: list[dict[str, Any]] = []
    route_segments: list[dict[str, Any]] = []
    simulation_id = 0
    max_activities = max(args.min_activities_per_agent, args.max_activities_per_agent)
    agent_types = sorted(RESIDENT_PERSONAS)
    for agent_idx in range(args.n):
        agent_id = f"agent_{agent_idx + 1:06d}"
        plan_id = f"plan_{agent_idx + 1:06d}"
        agent_type = rng.choice(agent_types)
        persona = RESIDENT_PERSONAS[agent_type]
        path_preference_type, path_preference = sample_path_preference(agent_type, rng)
        home_origin = choose_origin(agent_type, origins, population_origins, rng)
        current_origin = home_origin
        earliest_departure = 0
        activity_count = rng.randint(args.min_activities_per_agent, max_activities)
        for sequence in range(1, activity_count + 1):
            simulation_id += 1
            activity_id = f"{agent_id}_act_{sequence:02d}"
            route_id = f"{activity_id}_route"
            trip_type = rng.choice(persona["typical_trip_types"])
            purpose = rng.choice(TRIP_PURPOSES_BY_AGENT[agent_type][trip_type])
            behavior = TRIP_BEHAVIORS[trip_type]
            origin = current_origin
            destination = choose_destination(
                destinations=destinations,
                trip_type=trip_type,
                purpose=purpose,
                origin=origin,
                rng=rng,
                sample_size=args.destination_sample_size,
                distance_decay_m=args.destination_distance_decay_m,
            )
            candidate, candidate_distance_m = nearest_candidate(origin, destination, candidates, args.candidate_sample_size, rng)
            direct_distance_m = haversine_m(float(origin["lon"]), float(origin["lat"]), float(destination["lon"]), float(destination["lat"]))
            route_method = "straight_line_proxy"
            route_distance_m = direct_distance_m * args.route_detour_factor
            path_segments: list[dict[str, Any]] = []
            if router is not None:
                network_distance_m, network_method, network_segments = router.route(
                    float(origin["lon"]),
                    float(origin["lat"]),
                    float(destination["lon"]),
                    float(destination["lat"]),
                    preference=path_preference,
                    cost_mode=args.route_cost_mode,
                )
                if not math.isinf(network_distance_m):
                    route_distance_m = network_distance_m
                    route_method = network_method
                    path_segments = network_segments
                else:
                    route_method = "straight_line_fallback_no_road_path"
            if not path_segments:
                path_segments = [
                    {
                        "segment_type": "straight_line_fallback",
                        "edge_id": "",
                        "osm_id": "",
                        "fclass": "",
                        "fclass_cn": "",
                        "road_type": "",
                        "road_name": "",
                        "oneway": "",
                        "maxspeed": "",
                        "from_node": origin.get("facility_id", origin.get("unit_id", "")),
                        "to_node": destination.get("facility_id", ""),
                        "from_lon": float(origin["lon"]),
                        "from_lat": float(origin["lat"]),
                        "to_lon": float(destination["lon"]),
                        "to_lat": float(destination["lat"]),
                        "length_m": route_distance_m,
                    }
                ]
            road_edge_count = sum(segment.get("segment_type") == "road_edge" for segment in path_segments)
            access_connector_count = sum(segment.get("segment_type") == "access_connector" for segment in path_segments)
            route_generalized_cost = sum(
                float(segment.get("generalized_cost", segment.get("length_m", 0.0)))
                for segment in path_segments
            )
            detour_minutes = candidate_distance_m / max(args.walk_speed_m_per_min, 1)
            cooling_access = accessibility(candidate_distance_m, args.cooling_radius_m)
            cooling_match = intervention_match_score(trip_type, candidate)
            departure_minute, departure_time = sample_departure_time(purpose, rng)
            if departure_minute < earliest_departure:
                departure_minute = earliest_departure + rng.randint(10, 45)
                departure_time = clock_from_minutes(departure_minute)
            prepared_segments, route_exposure_metrics = calculate_segment_exposure_metrics(
                path_segments=path_segments,
                departure_minute=departure_minute,
                heat_period=heat_period,
                walk_speed_m_per_min=args.walk_speed_m_per_min,
                vulnerability_weight=VULNERABILITY_BY_AGENT[agent_type],
                fallback_heat_stress=args.missing_segment_heat_stress,
                high_heat_threshold=args.high_heat_segment_threshold,
                weather_modifier=weather_modifier,
            )
            outdoor_travel_minutes = route_exposure_metrics["route_travel_minutes"]
            route_heat_overlap = route_exposure_metrics["route_heat_overlap_minutes"]
            outdoor_dwell_minutes = sample_dwell_minutes(purpose, rng)
            arrival_minute = departure_minute + outdoor_travel_minutes
            dwell_end_minute = arrival_minute + outdoor_dwell_minutes
            earliest_departure = int(dwell_end_minute)
            total_outdoor_minutes = outdoor_travel_minutes + outdoor_dwell_minutes
            heat_overlap = overlap_minutes(departure_minute, total_outdoor_minutes, heat_period)
            dwell_heat_overlap = overlap_minutes(arrival_minute, outdoor_dwell_minutes, heat_period)
            dwell_weather = (
                weather_modifier.interval(arrival_minute, outdoor_dwell_minutes, heat_period)
                if weather_modifier is not None
                else None
            )
            dwell_weather_factor = dwell_weather.factor if dwell_weather is not None else 1.0
            dynamic_destination_dwell_heat_stress = max(
                0.0,
                min(1.0, args.destination_dwell_heat_stress * dwell_weather_factor),
            )
            dwell_exposure = cumulative_heat_exposure(
                heat_hazard=dynamic_destination_dwell_heat_stress,
                outdoor_minutes=dwell_heat_overlap,
                vulnerability_weight=VULNERABILITY_BY_AGENT[agent_type],
            )
            before_exposure = route_exposure_metrics["route_cumulative_heat_exposure"] + dwell_exposure
            effective_activity_heat_stress = (
                before_exposure / (heat_overlap * VULNERABILITY_BY_AGENT[agent_type])
                if heat_overlap > 0
                else 0.0
            )

            context = HeatDecisionContext(
                trip_type=trip_type,
                heat_stress=effective_activity_heat_stress,
                activity_necessity=float(ACTIVITY_NECESSITY_BY_PURPOSE[purpose]),
                time_rigidity=behavior.time_rigidity,
                route_flexibility=behavior.route_flexibility,
                personal_vulnerability=VULNERABILITY_BY_AGENT[agent_type],
                cooling_accessibility=cooling_access,
                cooling_match=cooling_match,
                stop_probability=behavior.stop_probability,
                detour_minutes=detour_minutes,
                detour_tolerance_minutes=behavior.detour_tolerance_minutes,
            )
            probabilities = action_probabilities(context)
            structured_action = choose_action(context, seed=rng.randrange(10_000_000))
            structured_reason = behavior_reason(purpose, structured_action, failure_zone(structured_action, trip_type, cooling_access))
            decision_source = "structured_agent_decision"
            action = structured_action
            decision_reason = structured_reason
            deepseek_error = ""
            if args.decision_mode == "deepseek" and effective_activity_heat_stress > 0:
                deepseek_context = {
                    "agent_type": agent_type,
                    "agent_label": persona["label"],
                    "trip_type": trip_type,
                    "trip_purpose": purpose,
                    "heat_stress": round(effective_activity_heat_stress, 4),
                    "route_mean_heat_stress": round(route_exposure_metrics["route_mean_heat_stress"], 4),
                    "route_max_heat_stress": round(route_exposure_metrics["route_max_heat_stress"], 4),
                    "route_environment_coverage": round(route_exposure_metrics["route_environment_coverage"], 4),
                    "activity_necessity": ACTIVITY_NECESSITY_BY_PURPOSE[purpose],
                    "time_rigidity": behavior.time_rigidity,
                    "route_flexibility": behavior.route_flexibility,
                    "heat_overlap_minutes": round(heat_overlap, 1),
                    "candidate_name": "" if candidate is None else candidate.get("poi_name", ""),
                    "cooling_accessibility": round(cooling_access, 3),
                    "cooling_match": round(cooling_match, 3),
                    "detour_minutes": round(detour_minutes, 1) if not math.isinf(detour_minutes) else None,
                }
                if args.deepseek_ablation == "no_spatial_context":
                    for key in [
                        "route_mean_heat_stress",
                        "route_max_heat_stress",
                        "route_environment_coverage",
                        "candidate_name",
                        "cooling_accessibility",
                        "cooling_match",
                        "detour_minutes",
                    ]:
                        deepseek_context.pop(key, None)
                try:
                    action, decision_reason, decision_source = choose_action_with_deepseek(
                        context=deepseek_context,
                        allowed_actions=list(ALLOWED_ACTIONS[trip_type]),
                        structured_action=structured_action,
                        structured_reason=structured_reason,
                        model=args.deepseek_model,
                        timeout_seconds=args.deepseek_timeout_seconds,
                        include_structured_prior=args.deepseek_ablation != "no_structured_prior",
                    )
                except Exception as exc:
                    deepseek_error = str(exc)
                    decision_source = "structured_fallback_after_deepseek_error"
            after_exposure = after_facility_exposure(before_exposure, cooling_access, cooling_match, action)
            status_before = activity_status(action, before_exposure, args.risky_exposure_threshold, args.failed_exposure_threshold)
            status_after = activity_status("normal", after_exposure, args.risky_exposure_threshold, args.failed_exposure_threshold)
            zone = failure_zone(action, trip_type, cooling_access)
            reason = decision_reason if args.decision_mode == "deepseek" and not deepseek_error else behavior_reason(purpose, action, zone)
            reduction_rate = 0.0 if before_exposure <= 0 else max(0.0, (before_exposure - after_exposure) / before_exposure)
            origin_id = origin.get("facility_id", origin.get("unit_id", ""))
            destination_id = destination.get("facility_id", "")
            candidate_id = "" if candidate is None else candidate.get("facility_id", "")

            rows.append(
                {
                    "simulation_id": simulation_id,
                    "agent_id": agent_id,
                    "plan_id": plan_id,
                    "activity_id": activity_id,
                    "activity_sequence": sequence,
                    "input_agent_type": agent_type,
                    "input_origin_lon": round(float(home_origin["lon"]), 6),
                    "input_origin_lat": round(float(home_origin["lat"]), 6),
                    "input_heat_stress": args.heat_stress,
                    "input_heat_period": args.heat_period,
                    "scenario_date": args.scenario_date if weather_modifier is not None else "",
                    "weather_mode": args.weather_mode,
                    "exposure_calculation_method": (
                        "sequential_segment_spatial_environment_x_hourly_weather_plus_destination_dwell"
                        if weather_modifier is not None
                        else "sequential_segment_environment_plus_destination_dwell"
                    ),
                    "agent_type": agent_type,
                    "agent_label": persona["label"],
                    "vulnerability_weight": VULNERABILITY_BY_AGENT[agent_type],
                    "trip_type": trip_type,
                    "trip_label": behavior.label,
                    "trip_purpose": purpose,
                    "activity_necessity": float(ACTIVITY_NECESSITY_BY_PURPOSE[purpose]),
                    "time_rigidity": behavior.time_rigidity,
                    "route_flexibility": behavior.route_flexibility,
                    "detour_tolerance_minutes": behavior.detour_tolerance_minutes,
                    "stop_probability": behavior.stop_probability,
                    "maximum_stop_minutes": behavior.maximum_stop_minutes,
                    "origin_id": origin_id,
                    "origin_name": origin.get("poi_name", ""),
                    "origin_unit_id": origin.get("unit_id", ""),
                    "origin_proxy_method": origin.get("origin_proxy_method", "population_grid_centroid"),
                    "origin_proxy_name": origin.get("origin_proxy_name", ""),
                    "origin_proxy_building_id": origin.get("origin_proxy_building_id", ""),
                    "origin_proxy_displacement_m": finite_float(
                        origin.get("origin_proxy_displacement_m", 0.0), 0.0
                    ),
                    "origin_euluc_residential_context": origin.get(
                        "euluc_residential_context", ""
                    ),
                    "origin_lon": round(float(origin["lon"]), 6),
                    "origin_lat": round(float(origin["lat"]), 6),
                    "destination_id": destination_id,
                    "destination_name": destination.get("poi_name", ""),
                    "destination_main_category": destination.get("main_category", ""),
                    "destination_euluc_context_labels": destination.get(
                        "euluc_context_labels", ""
                    ),
                    "destination_selection_rule": destination.get(
                        "destination_selection_rule", ""
                    ),
                    "destination_lon": round(float(destination["lon"]), 6),
                    "destination_lat": round(float(destination["lat"]), 6),
                    "departure_time": departure_time,
                    "arrival_time": clock_from_minutes(arrival_minute),
                    "candidate_id": candidate_id,
                    "candidate_name": "" if candidate is None else candidate.get("poi_name", ""),
                    "direct_distance_m": round(direct_distance_m, 1),
                    "route_id": route_id,
                    "route_method": route_method,
                    "path_preference_type": path_preference_type,
                    "path_preference_label": path_preference["label"],
                    "route_cost_mode": args.route_cost_mode,
                    "route_distance_m": round(route_distance_m, 1),
                    "route_generalized_cost": round(route_generalized_cost, 3),
                    "route_mean_heat_stress": round(route_exposure_metrics["route_mean_heat_stress"], 4),
                    "route_heat_period_mean_heat_stress": round(
                        route_exposure_metrics["route_heat_period_mean_heat_stress"], 4
                    ),
                    "route_max_heat_stress": round(route_exposure_metrics["route_max_heat_stress"], 4),
                    "high_heat_segment_length_share": round(
                        route_exposure_metrics["high_heat_segment_length_share"], 4
                    ),
                    "route_environment_coverage": round(route_exposure_metrics["route_environment_coverage"], 4),
                    "route_weather_factor_mean": round(route_exposure_metrics["route_weather_factor_mean"], 4),
                    "route_weather_temperature_mean_c": round(
                        route_exposure_metrics["route_weather_temperature_mean_c"], 3
                    ),
                    "route_weather_observed_minutes": round(
                        route_exposure_metrics["route_weather_observed_minutes"], 3
                    ),
                    "route_cumulative_heat_exposure": round(
                        route_exposure_metrics["route_cumulative_heat_exposure"], 3
                    ),
                    "route_heat_period_overlap_minutes": round(route_heat_overlap, 3),
                    "destination_dwell_heat_overlap_minutes": round(dwell_heat_overlap, 3),
                    "destination_dwell_spatial_heat_stress": args.destination_dwell_heat_stress,
                    "destination_dwell_weather_factor": round(dwell_weather_factor, 4),
                    "destination_dwell_heat_stress": round(dynamic_destination_dwell_heat_stress, 4),
                    "destination_dwell_heat_exposure": round(dwell_exposure, 3),
                    "route_segment_count": len(path_segments),
                    "road_edge_count": road_edge_count,
                    "access_connector_count": access_connector_count,
                    "candidate_distance_m": round(candidate_distance_m, 1) if not math.isinf(candidate_distance_m) else "",
                    "detour_minutes": round(detour_minutes, 1) if not math.isinf(detour_minutes) else "",
                    "outdoor_travel_minutes": round(outdoor_travel_minutes, 1),
                    "outdoor_dwell_minutes": outdoor_dwell_minutes,
                    "heat_period_overlap_minutes": round(heat_overlap, 1),
                    "max_continuous_outdoor_minutes": round(total_outdoor_minutes, 1),
                    "cumulative_heat_exposure": round(before_exposure, 3),
                    "cooling_accessibility": round(cooling_access, 3),
                    "cooling_match": round(cooling_match, 3),
                    "heat_stress": round(effective_activity_heat_stress, 4),
                    "action": action,
                    "decision_source": decision_source,
                    "deepseek_error": deepseek_error,
                    "activity_status": status_before,
                    "failure_zone_type": zone,
                    "facility_needs": ";".join(facility_needs(purpose)),
                    "suitable_facility_types": ";".join(suitable_facility_types(purpose)),
                    "reason": reason,
                    "before_exposure": round(before_exposure, 3),
                    "after_exposure": round(after_exposure, 3),
                    "after_activity_status": status_after,
                    "exposure_reduction_rate": round(reduction_rate, 3),
                    "activity_recovered": status_before in ["risky_completion", "behavior_changed"] and status_after == "normal",
                    "action_probabilities": json.dumps(probabilities, ensure_ascii=False),
                    "reference_source_ids": "",
                    "literature_weights_used": False,
                }
            )
            for segment_sequence, segment in enumerate(prepared_segments, start=1):
                segment_length_m = float(segment["length_m"])
                segment_travel_minutes = float(segment["travel_minutes"])
                segment_heat_overlap = float(segment["heat_overlap_minutes"])
                segment_exposure = float(segment["segment_heat_exposure"])
                route_segments.append(
                    {
                        "route_id": route_id,
                        "activity_id": activity_id,
                        "agent_id": agent_id,
                        "segment_sequence": segment_sequence,
                        "segment_type": segment.get("segment_type", "road_edge"),
                        "edge_id": segment.get("edge_id", ""),
                        "osm_id": segment.get("osm_id", ""),
                        "fclass": segment.get("fclass", ""),
                        "fclass_cn": segment.get("fclass_cn", ""),
                        "road_type": segment.get("road_type", ""),
                        "road_name": segment.get("road_name", ""),
                        "oneway": segment.get("oneway", ""),
                        "maxspeed": segment.get("maxspeed", ""),
                        "from_location_id": segment.get("from_node", ""),
                        "to_location_id": segment.get("to_node", ""),
                        "from_lon": round(float(segment["from_lon"]), 6),
                        "from_lat": round(float(segment["from_lat"]), 6),
                        "to_lon": round(float(segment["to_lon"]), 6),
                        "to_lat": round(float(segment["to_lat"]), 6),
                        "length_m": round(segment_length_m, 3),
                        "travel_minutes": round(segment_travel_minutes, 3),
                        "segment_start_time": clock_from_minutes(float(segment["segment_start_minute"])),
                        "segment_end_time": clock_from_minutes(float(segment["segment_end_minute"])),
                        "heat_stress": round(float(segment["segment_effective_heat_stress"]), 4),
                        "spatial_heat_stress": round(float(segment["segment_spatial_heat_stress"]), 4),
                        "weather_factor": round(float(segment["weather_factor"]), 4),
                        "weather_temperature_c": segment["weather_temperature_c"],
                        "weather_relative_humidity_percent": segment["weather_relative_humidity_percent"],
                        "weather_wind_speed_m_s": segment["weather_wind_speed_m_s"],
                        "weather_solar_radiation_w_m2_proxy": segment[
                            "weather_solar_radiation_w_m2_proxy"
                        ],
                        "weather_observed_minutes": round(float(segment["weather_observed_minutes"]), 3),
                        "heat_overlap_minutes": round(segment_heat_overlap, 3),
                        "cumulative_heat_exposure": round(
                            float(segment["route_cumulative_exposure_at_segment_end"]), 3
                        ),
                        "segment_heat_exposure": round(segment_exposure, 3),
                        "route_cumulative_exposure_at_segment_end": round(
                            float(segment["route_cumulative_exposure_at_segment_end"]), 3
                        ),
                        "environment_observed": bool(segment["environment_observed"]),
                        "environment_source": segment["environment_source"],
                        "route_method": route_method,
                        "path_preference_type": path_preference_type,
                        "route_cost_mode": args.route_cost_mode,
                        "generalized_cost": round(float(segment.get("generalized_cost", segment_length_m)), 3),
                        "lst": segment.get("lst", ""),
                        "tree_canopy_cover": segment.get("tree_canopy_cover", ""),
                        "pedestrian_shade_cover": segment.get("pedestrian_shade_cover", ""),
                        "distance_to_water_m": segment.get("distance_to_water_m", ""),
                        "effective_heat_stress": segment.get("effective_heat_stress", ""),
                    }
                )
            event_base = {
                "agent_id": agent_id,
                "plan_id": plan_id,
                "activity_id": activity_id,
                "route_id": route_id,
                "trip_purpose": purpose,
                "trip_type": trip_type,
                "heat_stress": round(effective_activity_heat_stress, 4),
            }
            events.extend(
                [
                    {
                        **event_base,
                        "event_time": departure_time,
                        "event_type": "depart",
                        "location_id": origin_id,
                        "location_name": origin.get("poi_name", ""),
                        "exposure_minutes": 0.0,
                        "decision": "",
                        "facility_id": "",
                    },
                    {
                        **event_base,
                        "event_time": departure_time,
                        "event_type": "heat_exposure",
                        "location_id": route_id,
                        "location_name": "route_segment_1",
                        "exposure_minutes": round(route_heat_overlap, 1),
                        "cumulative_heat_exposure": round(
                            route_exposure_metrics["route_cumulative_heat_exposure"], 3
                        ),
                        "decision": action,
                        "facility_id": candidate_id,
                    },
                    {
                        **event_base,
                        "event_time": clock_from_minutes(arrival_minute),
                        "event_type": "arrive",
                        "location_id": destination_id,
                        "location_name": destination.get("poi_name", ""),
                        "exposure_minutes": 0.0,
                        "decision": "",
                        "facility_id": "",
                    },
                    {
                        **event_base,
                        "event_time": clock_from_minutes(arrival_minute),
                        "event_type": "dwell",
                        "location_id": destination_id,
                        "location_name": destination.get("poi_name", ""),
                        "exposure_minutes": round(dwell_heat_overlap, 1),
                        "cumulative_heat_exposure": round(dwell_exposure, 3),
                        "decision": "",
                        "facility_id": "",
                    },
                ]
            )
            if action != "normal":
                events.append(
                    {
                        **event_base,
                        "event_time": departure_time,
                        "event_type": "behavior_change",
                        "location_id": origin_id if zone == "origin" else route_id if zone == "path" else destination_id,
                        "location_name": zone,
                        "exposure_minutes": round(heat_overlap, 1),
                        "decision": action,
                        "facility_id": candidate_id,
                    }
                )
            if action == "add_stop" and candidate is not None:
                events.append(
                    {
                        **event_base,
                        "event_time": clock_from_minutes(departure_minute + outdoor_travel_minutes / 2),
                        "event_type": "cooling_stop",
                        "location_id": candidate_id,
                        "location_name": candidate.get("poi_name", ""),
                        "exposure_minutes": 0.0,
                        "decision": action,
                        "facility_id": candidate_id,
                    }
                )
            decision_logs.append(
                {
                    "agent_id": agent_id,
                    "agent_type": agent_type,
                    "agent_label": persona["label"],
                    "plan_id": plan_id,
                    "activity_id": activity_id,
                    "activity_sequence": sequence,
                    "trip_type": trip_type,
                    "trip_purpose": purpose,
                    "available_actions": ";".join(ALLOWED_ACTIONS[trip_type]),
                    "selected_action": action,
                    "action_probabilities": json.dumps(probabilities, ensure_ascii=False),
                    "rule_check": "pass" if action in ALLOWED_ACTIONS[trip_type] else "fail",
                    "decision_source": decision_source,
                    "deepseek_error": deepseek_error,
                    "reason": reason,
                    "facility_implication": ";".join(facility_needs(purpose)),
                    "candidate_id": candidate_id,
                    "candidate_name": "" if candidate is None else candidate.get("poi_name", ""),
                    "cooling_accessibility": round(cooling_access, 3),
                    "cooling_match": round(cooling_match, 3),
                    "reference_source_ids": "",
                    "literature_weights_used": False,
                }
            )
            current_origin = destination

    results = pd.DataFrame(rows)
    summary = (
        results.groupby(["agent_label", "trip_label", "action"])
        .size()
        .reset_index(name="count")
        .sort_values(["agent_label", "trip_label", "count"], ascending=[True, True, False])
    )
    return results, summary, pd.DataFrame(events), pd.DataFrame(decision_logs), facilities, pd.DataFrame(route_segments)


def write_report(output_dir: Path, results: pd.DataFrame, summary: pd.DataFrame) -> None:
    lines = [
        "# Agent 单独运行报告",
        "",
        f"- 模拟 Agent 数：{int(results['agent_id'].nunique()) if 'agent_id' in results.columns else len(results)}",
        f"- 模拟活动数：{len(results)}",
        f"- 平均每个 Agent 活动数：{round(float(len(results) / max(results['agent_id'].nunique(), 1)), 2) if 'agent_id' in results.columns else 1.0}",
        f"- 风险完成数：{int((results['action'] == 'risky_completion').sum())}",
        f"- 增加停留数：{int((results['action'] == 'add_stop').sum())}",
        f"- 延迟/取消/替代/缩短数：{int(results['action'].isin(['delay', 'cancel', 'substitute', 'shorten']).sum())}",
        f"- 平均累计热暴露：{round(float(results['cumulative_heat_exposure'].mean()), 3)}",
        f"- 平均反事实热暴露降低率：{round(float(results['exposure_reduction_rate'].mean()), 3)}",
        "- 文献权重约束：未使用，文献仅作为方法参考",
        f"- 行为决策来源：{';'.join(sorted(results['decision_source'].dropna().astype(str).unique()))}",
        "",
        "## 行为统计",
        "",
        "| Agent | 出行类型 | 行为 | 数量 |",
        "|---|---|---|---:|",
    ]
    for row in summary.itertuples(index=False):
        lines.append(f"| {row.agent_label} | {row.trip_label} | {row.action} | {row.count} |")
    (output_dir / "agent_standalone_report.md").write_text("\n".join(lines), encoding="utf-8")


def write_calibration_report(
    output_dir: Path,
    diagnostics: pd.DataFrame,
    metadata: dict[str, Any],
) -> None:
    lines = [
        "# 公开统计校准报告",
        "",
        f"- 方法：{metadata.get('method', 'none')}",
        f"- 校准来源：{metadata.get('source_title', '')}",
        f"- 来源类型：{metadata.get('source_type', '')}",
        f"- 适用范围：{metadata.get('target_scope', '')}",
        f"- 校准前平均绝对误差：{metadata.get('mean_unweighted_absolute_error', '')}",
        f"- 校准后平均绝对误差：{metadata.get('mean_calibrated_absolute_error', '')}",
        f"- 权重范围：{metadata.get('minimum_calibration_weight', '')} - {metadata.get('maximum_calibration_weight', '')}",
        f"- 有效样本量：{metadata.get('effective_sample_size', '')}",
        "",
        "## 活动类别分布",
        "",
        "| 类别 | 目标占比 | 原始占比 | 校准占比 | 调整系数 |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in diagnostics.itertuples(index=False):
        lines.append(
            f"| {row.category} | {row.target_share:.4f} | {row.unweighted_share:.4f} | "
            f"{row.calibrated_share:.4f} | {row.raw_adjustment_factor:.4f} |"
        )
    lines.extend(
        [
            "",
            "## 当前仍未校准的维度",
            "",
        ]
    )
    lines.extend(f"- {item}" for item in metadata.get("uncalibrated_dimensions", []))
    lines.extend(
        [
            "",
            "## 使用要求",
            "",
            "涉及设施需求量、事件量、道路暴露量的聚合分析，应使用 `calibration_weight` 加权。",
            "个体行为机制分析可以同时报告未加权结果与加权结果。",
        ]
    )
    (output_dir / "calibration_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run an offline standalone heat-response Agent simulation.")
    parser.add_argument("--env-dir", default=Path("outputs/haidian/agent_env"), type=Path)
    parser.add_argument("--output-dir", default=Path("outputs/haidian/agent_runs/standalone"), type=Path)
    parser.add_argument("--n", default=500, type=int)
    parser.add_argument("--calibration-mode", choices=["none", "public_stats"], default="public_stats")
    parser.add_argument(
        "--calibration-config",
        default=Path("configs/public_stats_calibration_targets.json"),
        type=Path,
    )
    parser.add_argument("--min-activities-per-agent", default=1, type=int)
    parser.add_argument("--max-activities-per-agent", default=3, type=int)
    parser.add_argument("--heat-stress", default=0.85, type=float)
    parser.add_argument(
        "--missing-segment-heat-stress",
        default=0.70,
        type=float,
        help="Conservative fallback hazard for road segments without observed environment data.",
    )
    parser.add_argument(
        "--destination-dwell-heat-stress",
        default=0.70,
        type=float,
        help="Scenario hazard for outdoor dwell at destinations until destination-level heat is available.",
    )
    parser.add_argument("--high-heat-segment-threshold", default=0.70, type=float)
    parser.add_argument("--heat-period", default="10:00-16:00")
    parser.add_argument(
        "--weather-mode",
        choices=["none", "era5_hourly"],
        default="none",
        help="Apply an hourly city-scale weather factor to road spatial heat stress.",
    )
    parser.add_argument(
        "--weather-hourly",
        default=Path("outputs/haidian/weather/era5_land_haidian_2024_summer_hourly.csv"),
        type=Path,
    )
    parser.add_argument("--scenario-date", default="2024-06-18")
    parser.add_argument("--risky-exposure-threshold", default=25.0, type=float)
    parser.add_argument("--failed-exposure-threshold", default=65.0, type=float)
    parser.add_argument("--cooling-radius-m", default=500.0, type=float)
    parser.add_argument("--walk-speed-m-per-min", default=70.0, type=float)
    parser.add_argument("--candidate-sample-size", default=1000, type=int)
    parser.add_argument("--destination-sample-size", default=2500, type=int)
    parser.add_argument("--destination-distance-decay-m", default=1800.0, type=float)
    parser.add_argument("--route-detour-factor", default=1.25, type=float)
    parser.add_argument("--route-mode", choices=["road", "straight"], default="road")
    parser.add_argument(
        "--road-edges",
        default=Path("outputs/haidian/road/osm_walk_network/haidian_osm_walkable_edges_main.csv"),
        type=Path,
    )
    parser.add_argument(
        "--road-environment",
        default=Path("outputs/haidian/road/osm_walk_network/haidian_osm_road_environment.csv"),
        type=Path,
    )
    parser.add_argument("--route-cost-mode", choices=["distance", "environment"], default="environment")
    parser.add_argument("--decision-mode", choices=["structured", "deepseek"], default="structured")
    parser.add_argument("--deepseek-model", default="deepseek-v4-flash")
    parser.add_argument("--deepseek-timeout-seconds", default=30, type=int)
    parser.add_argument(
        "--deepseek-ablation",
        choices=["full", "no_spatial_context", "no_structured_prior"],
        default="full",
    )
    parser.add_argument("--env-file", default=Path(".env"), type=Path)
    parser.add_argument("--seed", default=42, type=int)
    args = parser.parse_args()

    ensure_dir(args.output_dir)
    load_env_file(args.env_file)
    results, summary, events, decision_logs, facilities, route_segments = simulate(args)
    calibration_metadata: dict[str, Any] = {
        "method": "none",
        "uncalibrated_dimensions": [],
    }
    calibration_diagnostics = pd.DataFrame()
    calibrated_summary = pd.DataFrame()
    if args.calibration_mode == "public_stats":
        calibration_config = load_calibration_config(args.calibration_config)
        results, calibration_diagnostics, calibration_metadata = apply_public_stats_calibration(
            results,
            calibration_config,
        )
        calibrated_summary = weighted_summary(results)
        events = attach_calibration_weight(events, results)
        decision_logs = attach_calibration_weight(decision_logs, results)
        route_segments = attach_calibration_weight(route_segments, results)
    else:
        results["activity_category"] = ""
        results["calibration_weight"] = 1.0
        calibrated_summary = weighted_summary(results)
        events = attach_calibration_weight(events, results)
        decision_logs = attach_calibration_weight(decision_logs, results)
        route_segments = attach_calibration_weight(route_segments, results)
    results.to_csv(args.output_dir / "agent_standalone_results.csv", index=False, encoding="utf-8-sig")
    summary.to_csv(args.output_dir / "agent_standalone_summary.csv", index=False, encoding="utf-8-sig")
    calibrated_summary.to_csv(args.output_dir / "agent_calibrated_summary.csv", index=False, encoding="utf-8-sig")
    calibration_diagnostics.to_csv(args.output_dir / "calibration_diagnostics.csv", index=False, encoding="utf-8-sig")
    events.to_csv(args.output_dir / "simulation_events.csv", index=False, encoding="utf-8-sig")
    decision_logs.to_csv(args.output_dir / "llm_decision_log.csv", index=False, encoding="utf-8-sig")
    facilities.to_csv(args.output_dir / "facilities.csv", index=False, encoding="utf-8-sig")
    route_segments.to_csv(args.output_dir / "route_segments.csv", index=False, encoding="utf-8-sig")
    write_report(args.output_dir, results, summary)
    if not calibration_diagnostics.empty:
        write_calibration_report(args.output_dir, calibration_diagnostics, calibration_metadata)
    run_metadata = {
        "literature_reference_file": "configs/agent_activity_evidence.json",
        "literature_weights_used": False,
        "sampling_method": "population-weighted origin units, hierarchically downscaled to residential-POI or residential-building walk-entry proxies with explicit road-node fallback, constrained by Haidian boundary, residential EULUC context, and main walkable-road component; destinations use purpose-specific POI semantics, EULUC context, same-component road access, distance limits, and distance-decay sampling; optional post-stratification uses official aggregate statistics",
        "calibration": {
            "mode": args.calibration_mode,
            "config": str(args.calibration_config),
            **calibration_metadata,
        },
        "parameters": {
            "n": args.n,
            "min_activities_per_agent": args.min_activities_per_agent,
            "max_activities_per_agent": args.max_activities_per_agent,
            "heat_stress": args.heat_stress,
            "missing_segment_heat_stress": args.missing_segment_heat_stress,
            "destination_dwell_heat_stress": args.destination_dwell_heat_stress,
            "high_heat_segment_threshold": args.high_heat_segment_threshold,
            "heat_period": args.heat_period,
            "weather_mode": args.weather_mode,
            "weather_hourly": str(args.weather_hourly),
            "weather_hourly_available": bool(args.weather_hourly.exists()),
            "scenario_date": args.scenario_date if args.weather_mode == "era5_hourly" else "",
            "risky_exposure_threshold": args.risky_exposure_threshold,
            "failed_exposure_threshold": args.failed_exposure_threshold,
            "cooling_radius_m": args.cooling_radius_m,
            "walk_speed_m_per_min": args.walk_speed_m_per_min,
            "destination_sample_size": args.destination_sample_size,
            "destination_distance_decay_m": args.destination_distance_decay_m,
            "origin_spatial_constraints": "inside_haidian+residential_context_250m+road_snap_100m+main_road_component",
            "destination_spatial_constraints": "purpose_semantics+euluc_context_100m+road_snap_100m+same_road_component",
            "route_detour_factor": args.route_detour_factor,
            "route_mode": args.route_mode,
            "road_edges": str(args.road_edges),
            "road_environment": str(args.road_environment),
            "road_environment_available": bool(args.road_environment.exists()),
            "route_cost_mode": args.route_cost_mode,
            "decision_mode": args.decision_mode,
            "deepseek_model": args.deepseek_model if args.decision_mode == "deepseek" else "",
            "deepseek_ablation": args.deepseek_ablation if args.decision_mode == "deepseek" else "",
            "seed": args.seed
        },
        "outputs": {
            "activity_results": "agent_standalone_results.csv",
            "summary": "agent_standalone_summary.csv",
            "calibrated_summary": "agent_calibrated_summary.csv",
            "calibration_diagnostics": "calibration_diagnostics.csv",
            "calibration_report": "calibration_report.md",
            "events": "simulation_events.csv",
            "decision_log": "llm_decision_log.csv",
            "facilities": "facilities.csv",
            "route_segments": "route_segments.csv"
        }
    }
    (args.output_dir / "run_metadata.json").write_text(
        json.dumps(run_metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"simulations": len(results), "output_dir": str(args.output_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
