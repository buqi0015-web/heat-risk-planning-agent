import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { analyzeAgentIntentWithLLM, buildAgentMemoryFromIntent, makeAgentMessageFromIntent } from "../agent/llmIntentAdapter.js";
import { createProjectMemory, getReusableRagMemory, makeProjectMemoryBrief, updateProjectMemory } from "../agent/projectMemory.js";
import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flame,
  Layers,
  LocateFixed,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Trees,
  User,
  Users,
  Zap,
} from "lucide-react";

const layerGroups = [
  {
    id: "risk",
    title: "高温风险",
    items: [
      ["极高风险", "#f15b36"],
      ["高风险", "#ff8d4a"],
      ["中风险", "#ffc474"],
      ["低风险", "#fff0a8"],
      ["极低风险", "#cdecc9"],
    ],
  },
  {
    id: "facility",
    title: "现有清凉设施",
    items: [
      ["固定清凉空间", "#0a9b91"],
      ["临时清凉点", "#10c9ba"],
      ["开放空间/公园", "#49b36c"],
    ],
  },
  {
    id: "gap",
    title: "设施缺口",
    items: [["服务不足区域", "#2f9ee5"]],
  },
  {
    id: "candidate",
    title: "候选点",
    items: [["推荐候选点", "#00978b"]],
  },
];

const candidateSites = [
  {
    id: 1,
    name: "海曼花园南门广场",
    place: "海曼区 · 海曼花园南门",
    score: 92,
    people: "2,860 人",
    improve: "-4.1 分钟",
    tags: ["热风险高", "老人社区", "现状缺口大"],
    status: "待核验",
  },
  {
    id: 2,
    name: "夏海小学东侧人行入口",
    place: "海曼区 · 夏海小学",
    score: 88,
    people: "1,952 人",
    improve: "-3.2 分钟",
    tags: ["学校周边", "儿童接送集聚"],
    status: "已核验",
  },
  {
    id: 3,
    name: "滨海路公交换乘站",
    place: "东湾区 · 滨海路站",
    score: 86,
    people: "3,120 人",
    improve: "-3.6 分钟",
    tags: ["公交换乘节点", "通勤人流大"],
    status: "已核验",
  },
];

const scenarios = [
  ["fairness", "公平优先", Users, "+18.6%", "4,200 人", "-3.9 分钟", "86", "强烈推荐"],
  ["efficiency", "效率优先", Target, "+22.4%", "4,950 人", "-4.8 分钟", "72", "推荐"],
  ["cost", "低成本优先", Building2, "+13.2%", "2,980 人", "-2.6 分钟", "58", "可考虑"],
  ["emergency", "应急优先", Zap, "+16.1%", "3,650 人", "-3.1 分钟", "76", "按需采用"],
];


const scenarioIconById = {
  fairness: Users,
  efficiency: Target,
  cost: Building2,
  emergency: Zap,
};

const scenarioIdByStateKey = {
  fairnessFirst: "fairness",
  efficiencyFirst: "efficiency",
  lowCostFirst: "cost",
  emergencyFirst: "emergency",
};

const scenarioRankById = {
  fairness: "强烈推荐",
  efficiency: "推荐",
  cost: "可考虑",
  emergency: "按需采用",
};

const scenarioCopyById = {
  fairness: "优先保障弱势群体与风险热点区域",
  efficiency: "优先提升整体覆盖效率与服务效能",
  cost: "以较低投入实现最大覆盖改善",
  emergency: "快速响应极端高温，强化应急保障",
};

function formatNumber(value, fallback = "0") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return new Intl.NumberFormat("zh-CN").format(Math.round(number));
}

function formatPercent(value, fallback = "+0%") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const normalized = Math.abs(number) <= 1 ? number * 100 : number;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(1)}%`;
}

function makeUiCandidateSites(agentState) {
  const sites = agentState?.candidateSites;
  if (!Array.isArray(sites) || !sites.length) return candidateSites;
  return sites.slice(0, 14).map((site, index) => ({
    id: index + 1,
    siteId: site.siteId,
    name: site.locationName ?? `候选点 ${index + 1}`,
    place: site.address || site.facilityType || "海淀区真实候选设施点",
    score: Math.round(Number(site.score ?? (100 - index * 4))),
    people: `${formatNumber(site.coveredPopulation)} 人`,
    coveredPopulation: Number(site.coveredPopulation ?? 0),
    improve: `-${Math.max(1, Math.round(Number(site.walkDistanceImprovement ?? 30) / 12))} 分钟`,
    walkDistanceImprovement: Number(site.walkDistanceImprovement ?? 0),
    facilityType: site.facilityType ?? "清凉设施",
    riskLevel: site.riskLevel,
    feasibility: site.feasibility,
    tags: (site.evidence ?? []).slice(0, 3),
    status: site.feasibility === "high" ? "可优先核验" : "待核验",
    coordinates: site.coordinates,
  }));
}

function getScenarioLabelById(scenarioOptions, scenarioId) {
  return scenarioOptions.find(([id]) => id === scenarioId)?.[1] ?? "公平优先";
}

function makeScenarioCandidateSites(sites = [], scenarioId = "fairness") {
  const ranked = [...sites];
  if (scenarioId === "efficiency") {
    return ranked
      .sort((a, b) => Number(b.coveredPopulation ?? 0) - Number(a.coveredPopulation ?? 0) || Number(b.score ?? 0) - Number(a.score ?? 0))
      .slice(0, 10);
  }
  if (scenarioId === "cost") {
    return ranked
      .sort((a, b) => {
        const readinessA = a.feasibility === "high" ? 2 : a.feasibility === "medium" ? 1 : 0;
        const readinessB = b.feasibility === "high" ? 2 : b.feasibility === "medium" ? 1 : 0;
        return readinessB - readinessA || Number(b.score ?? 0) - Number(a.score ?? 0);
      })
      .filter((site, index) => index % 2 === 0 || String(site.facilityType ?? "").includes("饮水"))
      .slice(0, 8);
  }
  if (scenarioId === "emergency") {
    return ranked
      .sort((a, b) => {
        const riskA = a.riskLevel === "extreme" ? 3 : a.riskLevel === "high" ? 2 : 1;
        const riskB = b.riskLevel === "extreme" ? 3 : b.riskLevel === "high" ? 2 : 1;
        return riskB - riskA || Number(b.walkDistanceImprovement ?? 0) - Number(a.walkDistanceImprovement ?? 0);
      })
      .slice(0, 9);
  }
  return ranked
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, 12);
}

function makeUiMetrics(agentState, uiCandidateSites) {
  const diagnosis = agentState?.diagnosis ?? {};
  const audit = agentState?.facilityAudit ?? {};
  return [
    ["高风险单元", formatNumber(diagnosis.priorityCells?.length ?? diagnosis.highRiskZones?.length ?? 12), "个", Flame],
    ["服务不足人口", formatNumber(audit.uncoveredPopulation ?? 4200), "人", Users],
    ["现有覆盖率", formatNumber((audit.coverageRate ?? 0.68) * 100), "%", ShieldCheck],
    ["推荐候选点", formatNumber(uiCandidateSites.length || 5), "个", MapPin],
  ];
}

function describeWeatherCode(code) {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "降雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "降雪";
  if ([95, 96, 99].includes(code)) return "雷阵雨";
  return "实时";
}

function useLiveWeather() {
  const [weather, setWeather] = useState({
    status: "loading",
    message: "正在获取海淀实时天气",
  });

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
        endpoint.search = new URLSearchParams({
          latitude: "39.96",
          longitude: "116.30",
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
          timezone: "Asia/Shanghai",
        }).toString();
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`weather ${response.status}`);
        const payload = await response.json();
        const current = payload.current ?? {};
        if (!Number.isFinite(Number(current.temperature_2m))) throw new Error("missing weather payload");
        if (!cancelled) {
          setWeather({
            status: "ready",
            temperature: Number(current.temperature_2m),
            apparent: Number(current.apparent_temperature),
            humidity: Number(current.relative_humidity_2m),
            wind: Number(current.wind_speed_10m),
            summary: describeWeatherCode(Number(current.weather_code)),
            updatedAt: current.time,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWeather({
            status: "error",
            message: "实时天气暂不可用",
          });
        }
      }
    };

    loadWeather();
    const timer = window.setInterval(loadWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return weather;
}

function makeUiScenarios(agentState) {
  const stateScenarios = agentState?.scenarios;
  if (!stateScenarios || !Object.keys(stateScenarios).length) return scenarios;
  return Object.entries(stateScenarios).map(([stateKey, item]) => {
    const id = scenarioIdByStateKey[stateKey] ?? stateKey;
    const Icon = scenarioIconById[id] ?? Target;
    return [
      id,
      item.label ?? stateKey,
      Icon,
      formatPercent(item.coverageRate),
      `${formatNumber(item.exposedPopulationReduced)} 人`,
      item.walkDistanceImprovement == null ? "-3.0 分钟" : `${Number(item.walkDistanceImprovement).toFixed(1)} 分钟`,
      formatNumber((1 - Number(item.costIndex ?? 0.5)) * 100, "70"),
      scenarioRankById[id] ?? "推荐",
      scenarioCopyById[id] ?? "基于真实处理结果生成的方案",
    ];
  });
}


const showcaseDataUrl = `${import.meta.env.BASE_URL}data/showcase.json`;

function asFeatureCollection(collection) {
  return collection?.type === "FeatureCollection" ? collection : { type: "FeatureCollection", features: [] };
}

function bboxFromFeatureCollection(collection) {
  const bounds = new maplibregl.LngLatBounds();
  const visit = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      bounds.extend(coords);
      return;
    }
    coords.forEach(visit);
  };
  collection?.features?.forEach((feature) => visit(feature.geometry?.coordinates));
  return bounds;
}

function segmentsToGeoJSON(segments = []) {
  return {
    type: "FeatureCollection",
    features: segments
      .filter((segment) => Number.isFinite(segment.from_lon) && Number.isFinite(segment.from_lat) && Number.isFinite(segment.to_lon) && Number.isFinite(segment.to_lat))
      .slice(0, 4000)
      .map((segment) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[segment.from_lon, segment.from_lat], [segment.to_lon, segment.to_lat]] },
        properties: {
          activity_id: segment.activity_id,
          road_name: segment.road_name ?? "Unnamed road",
          heat_stress: Number(segment.heat_stress ?? 0),
          segment_heat_exposure: Number(segment.segment_heat_exposure ?? 0),
        },
      })),
  };
}

function activityPointsToGeoJSON(activities = []) {
  const features = [];
  activities.slice(0, 260).forEach((activity) => {
    if (Number.isFinite(activity.origin_lon) && Number.isFinite(activity.origin_lat)) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.origin_lon, activity.origin_lat] },
        properties: { kind: "origin", name: activity.origin_name, label: activity.agent_label, status: activity.activity_status },
      });
    }
    if (Number.isFinite(activity.destination_lon) && Number.isFinite(activity.destination_lat)) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.destination_lon, activity.destination_lat] },
        properties: { kind: "destination", name: activity.destination_name, label: activity.agent_label, status: activity.activity_status },
      });
    }
  });
  return { type: "FeatureCollection", features };
}

function getUiCandidateCoordinate(site) {
  const coordinates = site?.coordinates;
  if (Array.isArray(coordinates) && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    return [Number(coordinates[0]), Number(coordinates[1])];
  }
  if (Number.isFinite(Number(coordinates?.lon)) && Number.isFinite(Number(coordinates?.lat))) {
    return [Number(coordinates.lon), Number(coordinates.lat)];
  }
  if (Number.isFinite(Number(site?.lon)) && Number.isFinite(Number(site?.lat))) {
    return [Number(site.lon), Number(site.lat)];
  }
  return null;
}

function uiCandidatesToGeoJSON(sites = []) {
  return {
    type: "FeatureCollection",
    features: sites
      .map((site) => {
        const coordinate = getUiCandidateCoordinate(site);
        if (!coordinate) return null;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: coordinate },
          properties: {
            ui_id: Number(site.id),
            site_id: site.siteId ?? site.id,
            name: site.name,
            score: Number(site.score ?? 0),
            status: site.status,
          },
        };
      })
      .filter(Boolean),
  };
}

function setLayerVisibility(map, layerIds, visible) {
  layerIds.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function RealHaidianMap({ activeLayers, selectedSite, setSelectedSite, candidateSites = [], compact = false }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapState, setMapState] = useState("loading");
  const [legendPosition, setLegendPosition] = useState(null);
  const [legendDrag, setLegendDrag] = useState(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;
    let cancelled = false;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e8f3f3" } }] },
      center: [116.3, 39.98],
      zoom: compact ? 10.1 : 10.55,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    fetch(showcaseDataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`showcase.json ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const boundary = asFeatureCollection(data.boundary);
        const landuse = asFeatureCollection(data.local_landuse_basemap);
        const roads = asFeatureCollection(data.roads);
        const routeSegments = segmentsToGeoJSON(data.segments);
        const activityPoints = activityPointsToGeoJSON(data.activities);
        const failureHotspots = asFeatureCollection(data.site_selection?.failure_hotspots);
        const facilities = asFeatureCollection(data.site_selection?.facility_scenarios_geojson);
        const uiCandidates = uiCandidatesToGeoJSON(candidateSites);

        const addLayers = () => {
          if (cancelled || map.getSource("osm")) return;
          map.addSource("osm", {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "\u00a9 OpenStreetMap contributors",
          });
          map.addSource("landuse", { type: "geojson", data: landuse });
          map.addSource("boundary", { type: "geojson", data: boundary });
          map.addSource("roads", { type: "geojson", data: roads });
          map.addSource("routeSegments", { type: "geojson", data: routeSegments });
          map.addSource("activityPoints", { type: "geojson", data: activityPoints });
          map.addSource("failureHotspots", { type: "geojson", data: failureHotspots });
          map.addSource("facilities", { type: "geojson", data: facilities });
          map.addSource("uiCandidates", { type: "geojson", data: uiCandidates });

          map.addLayer({ id: "osm-basemap", type: "raster", source: "osm", paint: { "raster-opacity": 0.72, "raster-saturation": -0.28 } });
          map.addLayer({
            id: "landuse-fill",
            type: "fill",
            source: "landuse",
            paint: {
              "fill-color": ["match", ["get", "euluc_label"], "\u516c\u56ed\u7eff\u5730", "#9fd0aa", "\u5c45\u4f4f\u7528\u5730", "#dce8ec", "\u6559\u80b2\u7528\u5730", "#cbdff4", "\u533b\u7597\u7528\u5730", "#f3c8bd", "\u5546\u52a1\u529e\u516c\u7528\u5730", "#e2d7f1", "\u4ea4\u901a\u7528\u5730", "#e5e8e8", "#eef4f3"],
              "fill-opacity": 0.38,
            },
          });
          map.addLayer({ id: "roads-base", type: "line", source: "roads", paint: { "line-color": "#94a7a8", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 13, 1.1, 15, 2.4], "line-opacity": 0.32 } });
          map.addLayer({
            id: "roads-heat",
            type: "line",
            source: "roads",
            paint: {
              "line-color": ["interpolate", ["linear"], ["coalesce", ["get", "effective_heat_stress"], ["get", "heat_stress"], 0], 0, "#14a89d", 0.45, "#f0c75a", 0.7, "#ff8954", 1, "#d84d39"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 13, 1.8, 15, 3.8],
              "line-opacity": 0.9,
            },
          });
          map.addLayer({
            id: "route-segments",
            type: "line",
            source: "routeSegments",
            paint: {
              "line-color": ["interpolate", ["linear"], ["get", "heat_stress"], 0, "#12a99e", 0.5, "#f0c75a", 0.75, "#ff8954", 1, "#d84d39"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 13, 2.4, 15, 4.2],
              "line-opacity": 0.78,
            },
          });
          map.addLayer({ id: "failure-hotspots", type: "circle", source: "failureHotspots", paint: { "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "hotspot_priority"], 0], 0, 5, 1, 18], "circle-color": "#ff6c45", "circle-opacity": 0.42, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2 } });
          map.addLayer({ id: "activity-points", type: "circle", source: "activityPoints", paint: { "circle-radius": 4.6, "circle-color": ["match", ["get", "kind"], "origin", "#16b8ad", "#6f8ee8"], "circle-opacity": 0.82, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
          map.addLayer({ id: "facilities", type: "circle", source: "facilities", paint: { "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "candidate_score"], ["get", "score_equity"], 0], 0, 5, 1, 14], "circle-color": "#008f86", "circle-opacity": 0.9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
          map.addLayer({ id: "ui-candidate-selected-halo", type: "circle", source: "uiCandidates", filter: ["==", ["get", "ui_id"], Number(selectedSite) || -1], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 13, 14, 24], "circle-color": "rgba(0, 151, 139, 0.18)", "circle-stroke-color": "#006d66", "circle-stroke-width": 2.4 } });
          map.addLayer({ id: "ui-candidate-points", type: "circle", source: "uiCandidates", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 14, 12], "circle-color": "#00a99d", "circle-opacity": 0.96, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.4 } });
          map.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#087c77", "line-width": 2.2, "line-opacity": 0.86 } });

          map.on("click", "ui-candidate-points", (event) => {
            const id = Number(event.features?.[0]?.properties?.ui_id);
            if (Number.isFinite(id)) setSelectedSite?.(id);
          });
          map.on("mouseenter", "ui-candidate-points", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "ui-candidate-points", () => { map.getCanvas().style.cursor = ""; });

          const bounds = bboxFromFeatureCollection(boundary);
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: compact ? 18 : 34, duration: 0 });
          setMapState("ready");
        };
        if (map.loaded()) addLayers();
        else map.once("load", addLayers);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setMapState("error");
      });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    setLayerVisibility(map, ["roads-heat"], activeLayers?.risk ?? true);
    setLayerVisibility(map, ["failure-hotspots"], activeLayers?.gap ?? true);
    setLayerVisibility(map, ["facilities", "ui-candidate-selected-halo", "ui-candidate-points"], (activeLayers?.candidate ?? true) || (activeLayers?.facility ?? true));
    setLayerVisibility(map, ["activity-points", "route-segments"], activeLayers?.facility ?? true);
  }, [activeLayers, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("uiCandidates");
    if (!map || mapState !== "ready" || !source?.setData) return;
    source.setData(uiCandidatesToGeoJSON(candidateSites));
  }, [candidateSites, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    if (map.getLayer("ui-candidate-selected-halo")) {
      map.setFilter("ui-candidate-selected-halo", ["==", ["get", "ui_id"], Number(selectedSite) || -1]);
    }
    const selected = candidateSites.find((site) => Number(site.id) === Number(selectedSite));
    const coordinate = getUiCandidateCoordinate(selected);
    if (!coordinate) return;
    map.flyTo({
      center: coordinate,
      zoom: compact ? 13.3 : 13.9,
      duration: 700,
      essential: true,
    });
  }, [candidateSites, compact, mapState, selectedSite]);

  useEffect(() => {
    const map = mapRef.current;
    const node = mapContainerRef.current;
    if (!map || !node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [mapState]);

  const startLegendDrag = (event) => {
    const panelRect = event.currentTarget.parentElement.getBoundingClientRect();
    const legendRect = event.currentTarget.getBoundingClientRect();
    setLegendPosition({
      x: legendRect.left - panelRect.left,
      y: legendRect.top - panelRect.top,
    });
    setLegendDrag({
      offsetX: event.clientX - legendRect.left,
      offsetY: event.clientY - legendRect.top,
      width: legendRect.width,
      height: legendRect.height,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveLegend = (event) => {
    if (!legendDrag || !mapContainerRef.current?.parentElement) return;
    const panelRect = mapContainerRef.current.parentElement.getBoundingClientRect();
    const nextX = event.clientX - panelRect.left - legendDrag.offsetX;
    const nextY = event.clientY - panelRect.top - legendDrag.offsetY;
    setLegendPosition({
      x: Math.max(8, Math.min(nextX, panelRect.width - legendDrag.width - 8)),
      y: Math.max(8, Math.min(nextY, panelRect.height - legendDrag.height - 8)),
    });
  };

  const legendStyle = legendPosition
    ? { left: `${legendPosition.x}px`, top: `${legendPosition.y}px`, bottom: "auto" }
    : undefined;

  return (
    <div
      className={compact ? "ref-map ref-map--compact ref-map--real" : "ref-map ref-map--real"}
      onPointerMove={moveLegend}
      onPointerUp={() => setLegendDrag(null)}
      onPointerLeave={() => setLegendDrag(null)}
    >
      <div ref={mapContainerRef} className="ref-real-map-canvas" />
      {mapState === "loading" ? <div className="ref-real-map-state">Loading Haidian OSM basemap and risk layers...</div> : null}
      {mapState === "error" ? <div className="ref-real-map-state ref-real-map-state--error">Real map data failed to load. Check data/showcase.json.</div> : null}
      <div className="ref-real-map-legend" style={legendStyle} onPointerDown={startLegendDrag}>
        <span><i className="risk" />{"\u9053\u8def\u70ed\u538b\u529b"}</span>
        <span><i className="gap" />{"\u8bbe\u65bd\u7f3a\u53e3\u70ed\u70b9"}</span>
        <span><i className="facility" />{"\u5019\u9009\u6e05\u51c9\u8bbe\u65bd"}</span>
        <span><i className="route" />{"\u884c\u4e3a\u8def\u7ebf\u6bb5"}</span>
      </div>
    </div>
  );
}

const flowSteps = ["目标理解", "前置检查", "空间分析", "候选点推荐", "人工核验", "下一步建议"];
const executionSteps = ["治理目标", "目标理解", "前置检查", "风险诊断", "设施缺口识别", "候选点生成", "方案比选", "人工核验"];

const defaultAgentMemory = {
  rawInput: "优先保障老人和接送学家庭，在高温风险区补充清凉设施。",
  taskType: "候选点推荐",
  targetArea: "滨水老城区",
  targetGroups: "老人、儿童接送家庭、户外劳动者",
  planningObject: "遮阴、饮水、休憩与清凉驿站",
  strategy: "公平优先",
  summary: "优先补足学校周边、老旧社区与公交换乘节点附近的清凉设施缺口。",
  affectedSteps: "风险诊断、设施缺口识别、候选点生成、方案比选",
};

function inferAgentMemory(input, fallbackStrategy = "公平优先") {
  const text = input.trim();
  const hasConstraint = /避开|不要|降低|成本|存量|学校门口|消防|道路红线|300|15分钟|可达/.test(text);
  const hasReport = /报告|汇报|导出|材料/.test(text);
  const hasGap = /缺|覆盖|到不了|15分钟|可达/.test(text);
  const hasRisk = /热|高温|风险|哪里/.test(text);
  const strategy = /效率/.test(text) ? "效率优先" : /成本|存量/.test(text) ? "低成本优先" : /应急/.test(text) ? "应急优先" : fallbackStrategy;
  const targetGroups = [
    /老人|老年/.test(text) ? "老人" : null,
    /儿童|学校|接送/.test(text) ? "儿童接送家庭" : null,
    /户外|劳动/.test(text) ? "户外劳动者" : null,
  ].filter(Boolean).join("、") || "重点暴露人群";

  let taskType = "候选点推荐";
  if (hasConstraint) taskType = "约束调整";
  else if (hasReport) taskType = "报告生成";
  else if (hasGap) taskType = "设施缺口识别";
  else if (hasRisk) taskType = "风险诊断";

  return {
    rawInput: text,
    taskType,
    targetArea: text.match(/[\u4e00-\u9fa5A-Za-z0-9]+街/)?.[0] || "滨水老城区",
    targetGroups,
    planningObject: /饮水/.test(text) ? "饮水点与补水设施" : /遮阴/.test(text) ? "遮阴设施" : "遮阴、饮水、休憩与清凉驿站",
    strategy,
    summary: hasConstraint
      ? "Agent 将保留风险诊断结果，回退到候选点生成、空间约束检查与方案比选步骤重新计算。"
      : "Agent 已将自然语言目标拆解为空间分析、设施核验、候选点生成和方案比选任务链。",
    affectedSteps: hasConstraint
      ? "候选点生成、空间约束检查、方案比选"
      : "目标理解、前置检查、风险诊断、设施缺口识别、候选点生成",
  };
}

function makeAgentReply(memory, agentState) {
  const topSite = agentState?.candidateSites?.[0]?.locationName ?? "\u5f85\u751f\u6210\u5019\u9009\u70b9";
  const uncovered = formatNumber(agentState?.facilityAudit?.uncoveredPopulation ?? 0);
  const coverage = formatNumber((agentState?.facilityAudit?.coverageRate ?? 0.64) * 100);
  return {
    role: "assistant",
    title: memory.taskType,
    text: `\u6211\u5df2\u7406\u89e3\u4f60\u7684\u76ee\u6807\uff0c\u4f1a\u5148\u6838\u5bf9\u9ad8\u6e29\u98ce\u9669\u3001\u73b0\u6709\u8bbe\u65bd\u8986\u76d6\u548c\u91cd\u70b9\u4eba\u7fa4\u66b4\u9732\uff0c\u518d\u7ed9\u51fa\u53ef\u6838\u9a8c\u7684\u5019\u9009\u70b9\u5efa\u8bae\u3002\u5f53\u524d\u8986\u76d6\u7387\u7ea6 ${coverage}%，\u670d\u52a1\u4e0d\u8db3\u4eba\u53e3\u7ea6 ${uncovered} \u4eba\uff0c\u9996\u4e2a\u5efa\u8bae\u70b9\u662f\u201c${topSite}\u201d\u3002`,
    chips: [memory.strategy, memory.taskType],
  };
}

function makeInitialAgentMessages(memory, agentState) {
  return [
    {
      role: "assistant",
      title: "\u53ef\u4ee5\u76f4\u63a5\u63d0\u51fa\u6cbb\u7406\u95ee\u9898",
      text: "\u4f60\u53ef\u4ee5\u50cf\u548c\u89c4\u5212\u52a9\u624b\u8ba8\u8bba\u4e00\u6837\u8f93\u5165\u76ee\u6807\uff0c\u4f8b\u5982\u201c\u67d0\u6761\u8857\u5e94\u8be5\u600e\u4e48\u6cbb\u7406\u201d\u3001\u201c\u54ea\u91cc\u6700\u7f3a\u6e05\u51c9\u8bbe\u65bd\u201d\u3002\u6211\u4f1a\u628a\u76ee\u6807\u62c6\u6210\u7a7a\u95f4\u5206\u6790\u548c\u5019\u9009\u70b9\u63a8\u8350\u3002",
      chips: ["Agent", "\u6c9f\u901a\u5165\u53e3"],
    },
    makeAgentReply(memory, agentState),
  ];
}

function TopBar({ variant = "spatial", scenarioDate, setScenarioDate, topbarPanel, setTopbarPanel }) {
  const openPanel = (panel) => setTopbarPanel?.(topbarPanel === panel ? null : panel);
  const panelCopy = {
    area: { title: "研究区", body: "当前使用海淀区本地热风险与行为模拟数据，地图范围可随项目切换。" },
    date: { title: "情景日期", body: `用于匹配热风险情景、实时天气与设施服务核验。当前日期：${scenarioDate}。` },
    export: { title: "导出", body: "当前页面可进入建议结果页查看方案摘要，报告导出仍使用 mock 流程。" },
    notice: { title: "通知", body: "暂无新的核验提醒。后续可接入审批、现场核验与数据更新通知。" },
    user: { title: "规划师", body: "当前身份用于记录方案版本与人工核验责任人。" },
  };
  return (
    <header className={`ref-topbar ref-topbar--${variant}`}>
      <div className="ref-brand">
        <span className="ref-brand__mark"><Trees size={28} /></span>
        <div>
          <strong>{variant === "execution" ? "城市清凉设施规划智能体" : "高温设施规划 Agent"}</strong>
          <small>{variant === "execution" ? "城市热环境与清凉设施规划 Copilot" : "城市高温韧性规划智能体"}</small>
        </div>
      </div>
      {variant === "comparison" ? <b className="ref-project-title">项目：滨水老城区高温韧性提升规划</b> : null}
      <div className="ref-topbar__meta">
        <button type="button" className={topbarPanel === "area" ? "is-open" : ""} onClick={() => openPanel("area")}><MapPin size={17} />研究区：海淀区</button>
        <label className={`ref-date-control ${topbarPanel === "date" ? "is-open" : ""}`}>
          <CalendarDays size={17} />
          <span>情景日期：</span>
          <input
            aria-label="情景日期"
            type="date"
            value={scenarioDate}
            onChange={(event) => setScenarioDate?.(event.target.value)}
            onFocus={() => openPanel("date")}
            onClick={() => openPanel("date")}
          />
        </label>
        <button type="button" className={topbarPanel === "export" ? "is-open" : ""} aria-label="导出" onClick={() => openPanel("export")}><ExternalLink size={18} /></button>
        <button type="button" className={topbarPanel === "notice" ? "is-open" : ""} aria-label="通知" onClick={() => openPanel("notice")}><Bell size={18} /></button>
        <button type="button" className={topbarPanel === "user" ? "is-open" : ""} onClick={() => openPanel("user")}><User size={18} />规划师<ChevronDown size={15} /></button>
      </div>
      {topbarPanel ? (
        <div className="ref-topbar-popover">
          <strong>{panelCopy[topbarPanel]?.title}</strong>
          <p>{panelCopy[topbarPanel]?.body}</p>
        </div>
      ) : null}
    </header>
  );
}

function Toggle({ checked, onClick }) {
  return (
    <button type="button" className={checked ? "ref-toggle ref-toggle--on" : "ref-toggle"} onClick={onClick} aria-pressed={checked}>
      <i />
    </button>
  );
}

function LayerPanel({ activeLayers, toggleLayer, version, setVersion, planVersions, createPlanVersion }) {
  return (
    <aside className="ref-layer-panel">
      <div className="ref-panel-title">
        <h2>空间图层</h2>
        <button type="button" aria-label="收起图层"><ChevronRight size={19} /></button>
      </div>
      {layerGroups.map((group) => (
        <section className="ref-layer-group" key={group.id}>
          <div className="ref-layer-group__head">
            <strong>{group.title}</strong>
            <Toggle checked={activeLayers[group.id]} onClick={() => toggleLayer(group.id)} />
          </div>
          <div className="ref-layer-items">
            {group.items.map(([label, color]) => (
              <button type="button" key={label} className={!activeLayers[group.id] ? "is-muted" : ""}>
                <i style={{ background: color }} />
                {label}
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="ref-layer-group ref-version-group">
        <div className="ref-layer-group__head">
          <strong>方案版本</strong>
          <ChevronRight size={16} />
        </div>
        {planVersions.map((item) => (
          <button
            type="button"
            key={item.id}
            className={version === item.name ? "ref-version-row ref-version-row--active" : "ref-version-row"}
            onClick={() => setVersion(item.name)}
          >
            <span>{item.name}{version === item.name ? "（当前）" : ""}</span>
            <Layers size={16} />
          </button>
        ))}
      </section>
      <button type="button" className="ref-outline-action" onClick={createPlanVersion}>
        <Plus size={16} />新建方案
      </button>
    </aside>
  );
}

function MapCanvas({ activeLayers, selectedSite, setSelectedSite, candidateSites: sites = [], compact = false }) {
  return <RealHaidianMap activeLayers={activeLayers} selectedSite={selectedSite} setSelectedSite={setSelectedSite} candidateSites={sites} compact={compact} />;

  const visible = {
    risk: activeLayers?.risk ?? true,
    gap: activeLayers?.gap ?? true,
    candidate: activeLayers?.candidate ?? true,
    facility: activeLayers?.facility ?? true,
  };
  const pins = [
    [1, 37, 31], [2, 88, 39], [3, 29, 57], [4, 58, 68], [5, 69, 60],
  ];
  const poi = [[21, 33, "school"], [49, 46, "people"], [72, 26, "bus"], [79, 54, "park"], [63, 37, "cool"]];

  return (
    <div className={compact ? "ref-map ref-map--compact" : "ref-map"}>
      <div className="ref-map__grid" />
      <div className="ref-map__water ref-map__water--one" />
      <div className="ref-map__water ref-map__water--two" />
      <div className="ref-map__park ref-map__park--one">中央公园</div>
      <div className="ref-map__park ref-map__park--two">滨江公园</div>
      {visible.risk ? (
        <>
          <i className="ref-risk ref-risk--one" />
          <i className="ref-risk ref-risk--two" />
          <i className="ref-risk ref-risk--three" />
          <i className="ref-risk ref-risk--four" />
          <i className="ref-risk ref-risk--five" />
        </>
      ) : null}
      {visible.gap ? (
        <>
          <i className="ref-gap ref-gap--one" />
          <i className="ref-gap ref-gap--two" />
          <i className="ref-gap ref-gap--three" />
          <i className="ref-gap ref-gap--four" />
        </>
      ) : null}
      {visible.facility ? poi.map(([left, top, type], index) => (
        <button type="button" className={`ref-poi ref-poi--${type}`} style={{ left: `${left}%`, top: `${top}%` }} key={`${type}-${index}`}>
          {type === "school" ? "学" : type === "bus" ? "车" : type === "park" ? "园" : type === "people" ? "人" : "凉"}
        </button>
      )) : null}
      {visible.candidate ? pins.map(([id, left, top]) => (
        <button
          type="button"
          className={selectedSite === id ? "ref-map-pin ref-map-pin--active" : "ref-map-pin"}
          style={{ left: `${left}%`, top: `${top}%` }}
          key={id}
          onClick={() => setSelectedSite(id)}
        >
          <span>{id}</span>
        </button>
      )) : null}
      {["滨江小学", "老码头社区", "文华社区", "人民路换乘站", "市民广场"].map((label, index) => (
        <span className={`ref-map-label ref-map-label--${index + 1}`} key={label}>{label}</span>
      ))}
      <div className="ref-map-tools">
        <button type="button"><LocateFixed size={20} /></button>
        <button type="button"><Plus size={22} /></button>
        <button type="button">−</button>
        <button type="button"><Layers size={22} /></button>
      </div>
      <div className="ref-scale"><i /><span>0</span><span>250</span><span>500</span><span>750 m</span></div>
    </div>
  );
}

function MetricStrip({ metrics, weather }) {
  const displayMetrics = metrics ?? [
    ["高风险单元", "12", "个", Flame],
    ["服务不足人口", "4,200", "人", Users],
    ["现有覆盖率", "68", "%", ShieldCheck],
    ["推荐候选点", "5", "个", MapPin],
  ];
  const weatherReady = weather?.status === "ready";
  const weatherValue = weatherReady ? `${Math.round(weather.temperature)}°` : "--°";
  const weatherSummary = weatherReady ? weather.summary : weather?.status === "error" ? "暂不可用" : "连接中";
  const apparentValue = Number.isFinite(weather?.apparent) ? Math.round(weather.apparent) : "--";
  const humidityValue = Number.isFinite(weather?.humidity) ? Math.round(weather.humidity) : "--";
  const weatherMeta = weatherReady
    ? `体感 ${apparentValue}° · 湿度 ${humidityValue}%`
    : weather?.message ?? "正在获取海淀实时天气";
  return (
    <div className="ref-metric-strip">
      <article className="ref-weather-metric">
        <span><Sun size={24} /></span>
        <div>
          <small>海淀实时天气</small>
          <strong>{weatherValue}<em>{weatherSummary}</em></strong>
          <b>{weatherMeta}</b>
        </div>
      </article>
      {displayMetrics.map(([label, value, unit, Icon]) => (
        <article key={label}>
          <span><Icon size={24} /></span>
          <div>
            <small>{label}</small>
            <strong>{value}<em>{unit}</em></strong>
          </div>
        </article>
      ))}
    </div>
  );
}

function AgentCommandBox({ value, setValue, onSubmit, mode = "goal", compact = false, showChips = true }) {
  const inputRef = useRef(null);
  const chips = mode === "constraint"
    ? ["避开学校门口", "降低成本，优先存量复用", "步行距离小于300m"]
    : mode === "candidate"
      ? ["解释当前候选点依据", "比较前3个候选点", "承接上一页目标调整"]
      : ["某某街应该怎么治理？", "哪里最缺清凉设施？", "优先保障老人和接送学家庭"];
  const label = mode === "constraint"
    ? "新增约束 / 调整方案"
    : mode === "candidate"
      ? "追问候选点证据"
      : "输入治理目标";
  const placeholder = mode === "constraint"
    ? "例如：避开学校门口，优先利用社区服务中心"
    : mode === "candidate"
      ? "例如：解释当前候选点为什么优先，或把上一页目标改为优先老人后重新看候选点"
      : "例如：某某街应该怎么治理？";

  const submitText = (nextValue = value) => {
    const text = nextValue.trim();
    if (!text) return;
    setValue("");
    onSubmit(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = (event) => {
    event.preventDefault();
    submitText();
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submitText();
  };

  return (
    <form className={compact ? "ref-agent-command ref-agent-command--compact" : "ref-agent-command"} onSubmit={submit}>
      <label htmlFor={mode === "constraint" ? "constraint-command" : "agent-command"}>
        {label}
      </label>
      <div className="ref-command-row">
        <textarea
          ref={inputRef}
          id={mode === "constraint" ? "constraint-command" : "agent-command"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={compact ? 2 : 3}
          placeholder={placeholder}
        />
        <button type="submit" aria-label="提交给 Agent" disabled={!value.trim()}><Send size={16} /></button>
      </div>
      <p className="ref-command-hint">Enter 发送，Shift + Enter 换行</p>
      {showChips ? (
        <div className="ref-command-chips">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => submitText(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

function AgentMemoryCard({ memory }) {
  return (
    <section className="ref-agent-memory">
      <span>当前理解</span>
      <strong>{memory.taskType}</strong>
      <p>{memory.summary}</p>
      <dl>
        <div><dt>研究对象</dt><dd>{memory.targetArea}</dd></div>
        <div><dt>重点人群</dt><dd>{memory.targetGroups}</dd></div>
        <div><dt>规划设施</dt><dd>{memory.planningObject}</dd></div>
        <div><dt>影响步骤</dt><dd>{memory.affectedSteps}</dd></div>
      </dl>
    </section>
  );
}

function AgentActionSummary({ memory, stage = "planning" }) {
  return (
    <section className="ref-agent-action">
      <span>{stage === "comparison" ? "当前调整" : "当前动作"}</span>
      <strong>{stage === "comparison" ? "正在根据新约束更新方案版本" : "正在把治理目标转译为空间规划任务"}</strong>
      <p>{memory.summary}</p>
      <div>
        <b>{memory.strategy}</b>
        <b>{memory.taskType}</b>
      </div>
    </section>
  );
}

function AgentConversation({ messages = [] }) {
  const dialogueRef = useRef(null);

  useEffect(() => {
    const element = dialogueRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  return (
    <section ref={dialogueRef} className="ref-agent-dialogue" aria-label="Agent 沟通过程">
      {messages.map((message, index) => (
        <article
          key={`${message.role}-${index}`}
          className={message.role === "user" ? "ref-agent-message ref-agent-message--user" : "ref-agent-message ref-agent-message--assistant"}
        >
          {message.title ? <strong>{message.title}</strong> : null}
          <p>{message.text}</p>
          {message.chips?.length ? (
            <div className="ref-agent-message__chips">
              {message.chips.map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function SpatialAgentPanel({ goToExecution, command, setCommand, submitAgentCommand, agentMessages }) {
  return (
    <aside className="ref-agent-panel ref-agent-panel--spatial">
      <div className="ref-agent-title">
        <h2>规划智能体</h2>
        <span><Sparkles size={24} /></span>
      </div>
      <AgentConversation messages={agentMessages} />
      <AgentCommandBox value={command} setValue={setCommand} onSubmit={submitAgentCommand} />
      <button type="button" className="ref-primary-action" onClick={goToExecution}>
        查看建议结果 <ChevronRight size={18} />
      </button>
    </aside>
  );
}

function SpatialState(props) {
  return (
    <section className="ref-screen ref-screen--spatial">
      <TopBar {...props} />
      <div className="ref-spatial-grid">
        <LayerPanel {...props} />
        <main className="ref-map-shell">
          <MetricStrip metrics={props.metrics} weather={props.weather} />
          <MapCanvas activeLayers={props.activeLayers} selectedSite={props.selectedSite} setSelectedSite={props.setSelectedSite} candidateSites={props.candidateSites} />
        </main>
        <SpatialAgentPanel
          goToExecution={props.goToExecution}
          command={props.command}
          setCommand={props.setCommand}
          submitAgentCommand={props.submitAgentCommand}
          agentMessages={props.agentMessages}
        />
      </div>
    </section>
  );
}

function ProjectSidebar({ goToComparison }) {
  return (
    <aside className="ref-project-sidebar">
      <div className="ref-exec-brand">
        <span><Building2 size={25} /></span>
        <div><strong>城市清凉设施规划智能体</strong><small>城市热环境与清凉设施规划 Copilot</small></div>
      </div>
      <button type="button" className="ref-city-select"><MapPin size={17} />夏海市<ChevronDown size={15} /></button>
      <div className="ref-project-card">
        <div className="ref-thumb ref-thumb--skyline" />
        <div><strong>夏海市清凉设施专项规划</strong><span>进行中</span><small>更新于 10:24</small></div>
      </div>
      {["概览", "空间底图", "热环境分析", "重点人群分布", "现有设施评估", "清凉设施规划", "方案比选", "评估报告", "项目设置"].map((item) => (
        <button type="button" className={item === "清凉设施规划" ? "ref-menu-row ref-menu-row--active" : "ref-menu-row"} key={item} onClick={item === "方案比选" ? goToComparison : undefined}>
          <Layers size={16} />{item}
        </button>
      ))}
      <div className="ref-versions">
        <div><strong>方案版本</strong><button type="button">新建方案</button></div>
        {["v3 候选点优化方案", "v2 候选点初步方案", "v1 基础评估方案"].map((item, index) => (
          <button type="button" className={index === 0 ? "ref-version-tile ref-version-tile--active" : "ref-version-tile"} key={item}>
            <strong>{item}</strong><small>{index === 0 ? "今天 10:24" : index === 1 ? "昨天 17:35" : "06-02 14:22"}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function CandidateTable({ selectedSite, setSelectedSite, onSelectSite, sites = candidateSites }) {
  return (
    <section className="ref-candidate-table">
      <div className="ref-table-head">
        <h2>候选点清单（{sites.length}）</h2>
        <div>
          <button type="button">综合优先级<ChevronDown size={14} /></button>
          <button type="button">全部状态<ChevronDown size={14} /></button>
          <label><Search size={15} /><input placeholder="搜索地点名称" /></label>
          <button type="button"><Download size={15} />导出清单</button>
        </div>
      </div>
      <div className="ref-table">
        <div className="ref-table-row ref-table-row--header">
          <span>候选点信息</span><span>综合优先级</span><span>覆盖人群</span><span>步行可达性改善</span><span>关键证据</span><span>人工核验状态</span><span>操作</span>
        </div>
        {sites.map((site) => (
          <button
            type="button"
            className={selectedSite === site.id ? "ref-table-row ref-table-row--active" : "ref-table-row"}
            key={site.id}
            onClick={() => {
              setSelectedSite(site.id);
              onSelectSite?.(site);
            }}
          >
            <span className="ref-site-info"><b>{site.id}</b><i className={`ref-thumb ref-thumb--${site.id}`} /><em><strong>{site.name}</strong><small>{site.place}</small></em></span>
            <span><mark>高</mark><small>综合得分 {site.score}</small></span>
            <span><strong>{site.people}</strong><small>+{site.id === 1 ? "68" : site.id === 2 ? "54" : "61"}%</small></span>
            <span><strong>{site.id === 1 ? "8.5" : site.id === 2 ? "6.3" : "7.2"} 分钟</strong><small>{site.improve}</small></span>
            <span className="ref-tags">{site.tags.map((tag) => <i key={tag}>{tag}</i>)}</span>
            <span><small>{site.status}</small><small>{site.id === 1 ? "未分配" : "规划师已确认"}</small></span>
            <span><ChevronRight size={18} /></span>
          </button>
        ))}
      </div>
      <button type="button" className="ref-view-all">查看全部 14 个候选点 <ChevronDown size={14} /></button>
    </section>
  );
}

function ExecutionAgentPanel({ goToComparison, command, setCommand, submitAgentCommand, agentMessages, selectedSiteData }) {
  return (
    <aside className="ref-exec-agent">
      <div className="ref-exec-agent__head">
        <span><Bot size={28} /></span>
        <div><h2>规划智能体</h2><p>{selectedSiteData ? `当前候选点：${selectedSiteData.name}` : "承接目标，追问候选点依据"}</p></div>
      </div>
      <AgentConversation messages={agentMessages} />
      <AgentCommandBox value={command} setValue={setCommand} onSubmit={submitAgentCommand} mode="candidate" compact />
      <button type="button" className="ref-primary-action" onClick={goToComparison}>
        进入方案比选 <ChevronRight size={18} />
      </button>
    </aside>
  );
}

function ExecutionState(props) {
  const [mapHeight, setMapHeight] = useState(340);
  const execMainRef = useRef(null);

  const startMapResize = (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = mapHeight;
    const containerHeight = execMainRef.current?.getBoundingClientRect().height ?? 820;
    const maxHeight = Math.max(260, containerHeight - 250);
    const minHeight = 220;

    const onMove = (moveEvent) => {
      const nextHeight = startHeight + moveEvent.clientY - startY;
      setMapHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  return (
    <section className="ref-screen ref-screen--execution">
      <ProjectSidebar goToComparison={props.goToComparison} />
      <main className="ref-exec-main" ref={execMainRef} style={{ "--ref-exec-map-height": `${mapHeight}px` }}>
        <div className="ref-exec-top">
          <h1>候选点证据核验</h1>
          <button type="button" onClick={props.goToSpatial}><RotateCcw size={15} />返回空间分析</button>
          <button type="button"><Layers size={15} />图层</button>
          <button type="button"><Filter size={15} />筛选</button>
          <button type="button">图例</button>
        </div>
        <div className="ref-exec-map-card">
          <div className="ref-legend-strip"><span>热风险等级 低 <i /> 高</span><span>重点人群密度 低 <i /> 高</span><span>现有设施</span><span>设施缺口区</span><span>候选点</span></div>
          <MapCanvas activeLayers={props.activeLayers} selectedSite={props.selectedSite} setSelectedSite={props.setSelectedSite} candidateSites={props.candidateSites} compact />
        </div>
        <button type="button" className="ref-exec-resizer" onPointerDown={startMapResize} aria-label="调整地图和候选点清单高度" />
        <CandidateTable
          selectedSite={props.selectedSite}
          setSelectedSite={props.setSelectedSite}
          sites={props.candidateSites}
        />
      </main>
      <ExecutionAgentPanel
        goToComparison={props.goToComparison}
        command={props.command}
        setCommand={props.setCommand}
        submitAgentCommand={props.submitAgentCommand}
        agentMessages={props.agentMessages}
        selectedSiteData={props.candidateSites.find((site) => Number(site.id) === Number(props.selectedSite))}
      />
    </section>
  );
}

function MiniMap({ activeLayers, selectedSite, setSelectedSite, candidateSites: sites = [], scenarioLabel = "公平优先" }) {
  return (
    <aside className="ref-mini-map-panel">
      <div className="ref-section-title">
        <div>
          <h2>方案空间概览</h2>
          <p>{scenarioLabel} · {sites.length} 个设施点</p>
        </div>
        <button type="button"><ExternalLink size={16} /></button>
      </div>
      <MapCanvas activeLayers={activeLayers} selectedSite={selectedSite} setSelectedSite={setSelectedSite} candidateSites={sites} compact />
      <div className="ref-mini-legend">
        {["高风险区域", "中风险区域", "低风险区域", "候选点", "现有清凉设施", "步行 10 分钟可达范围"].map((item) => <span key={item}>{item}</span>)}
      </div>
    </aside>
  );
}

function ComparisonTable({ scenario, setScenario, scenarioOptions = scenarios, scenarioCandidateSites = [] }) {
  const activeLabel = getScenarioLabelById(scenarioOptions, scenario);
  return (
    <section className="ref-comparison-board">
      <div className="ref-section-title">
        <div><h1>方案比选</h1><p>从公平、效率、成本与应急响应等维度，综合评估不同策略的实施效果与可行性。</p></div>
        <button type="button" className="ref-recommend-badge"><Star size={15} />当前方案：{activeLabel}</button>
      </div>
      <div className="ref-scenario-grid">
        {scenarioOptions.map(([id, label, Icon, coverage, people, walk, score, rank, description]) => (
          <button
            type="button"
            aria-label={`选择${label}方案`}
            className={scenario === id ? "ref-scenario-col ref-scenario-col--active" : "ref-scenario-col"}
            key={id}
            onClick={() => setScenario(id)}
          >
            <Icon size={31} />
            <strong>{label}</strong>
            <p>{id === "fairness" ? "优先保障弱势群体与风险热点区域" : id === "efficiency" ? "优先提升整体覆盖效率与服务效能" : id === "cost" ? "以较低投资实现最大覆盖改善" : "快速响应极端高温，强化应急保障"}</p>
            <b>{coverage}</b><span>覆盖提升</span>
            <b>{people}</b><span>未覆盖人口减少</span>
            <b>{walk}</b><span>步行距离改善</span>
            <b>{score}</b><span>公平性评分</span>
            <em>{rank}</em>
          </button>
        ))}
      </div>
      <div className="ref-board-note"><Check size={18} />已切换至{activeLabel}，左侧地图仅显示该方案纳入的 {scenarioCandidateSites.length} 个设施点，可继续在智能体中追问方案依据。</div>
    </section>
  );
}

function ComparisonAgentPanel({ command, setCommand, submitAgentCommand, agentMessages, scenarioLabel }) {
  return (
    <aside className="ref-exec-agent ref-exec-agent--comparison">
      <div className="ref-exec-agent__head">
        <span><Bot size={28} /></span>
        <div><h2>规划智能体</h2><p>当前比选方案：{scenarioLabel}</p></div>
      </div>
      <AgentConversation messages={agentMessages} />
      <AgentCommandBox value={command} setValue={setCommand} onSubmit={submitAgentCommand} mode="constraint" compact />
    </aside>
  );
}

function EvidencePanel({ command, setCommand, submitConstraintCommand, agentMemory }) {
  const groups = [
    ["推荐依据", ["优先覆盖高风险区与重点人群密集区", "显著改善学校周边与老旧社区服务", "步行距离改善明显，达成可感知提升", "实施难度适中，资源与建设条件可行"]],
    ["数据不确定性", ["人口数据（夜间活动人口） ±8%", "步行网络运行时间估计 ±6%", "未来极端高温频率预测 ±10%"]],
    ["现场核验事项", ["候选点周边用地权属与开发可行性", "道路遮阴条件与设施摊位可实施性", "社区与学校意见征询结果", "现有设施运营状况与开放时间"]],
    ["不能自动决策内容", ["资金来源与年度投资安排", "设施类型与服务标准最终选型", "建设时序与部门协调路径"]],
  ];
  return (
    <aside className="ref-evidence-panel">
      <h2><ShieldCheck size={22} />证据与核验</h2>
      <AgentCommandBox
        value={command}
        setValue={setCommand}
        onSubmit={submitConstraintCommand}
        mode="constraint"
        compact
      />
      <AgentMemoryCard memory={agentMemory} />
      <AgentActionSummary memory={agentMemory} stage="comparison" />
      {groups.map(([title, items], index) => (
        <section className={index === 3 ? "ref-evidence-group ref-evidence-group--risk" : "ref-evidence-group"} key={title}>
          <h3>{title}</h3>
          {items.map((item) => <p key={item}><Check size={15} />{item}</p>)}
        </section>
      ))}
    </aside>
  );
}

function ComparisonState(props) {
  return (
    <section className="ref-screen ref-screen--comparison">
      <TopBar variant="comparison" {...props} />
      <div className="ref-comparison-grid">
        <MiniMap activeLayers={props.activeLayers} selectedSite={props.selectedSite} setSelectedSite={props.setSelectedSite} candidateSites={props.scenarioCandidateSites} scenarioLabel={props.scenarioLabel} />
        <ComparisonTable scenario={props.scenario} setScenario={props.setScenario} scenarioOptions={props.scenarioOptions} scenarioCandidateSites={props.scenarioCandidateSites} />
        <ComparisonAgentPanel
          command={props.command}
          setCommand={props.setCommand}
          submitAgentCommand={props.submitAgentCommand}
          agentMessages={props.agentMessages}
          scenarioLabel={props.scenarioLabel}
        />
      </div>
      <footer className="ref-bottom-actions">
        <button type="button" className="ref-primary-action" onClick={props.onReport}><FileText size={20} />生成审议报告</button>
        <button type="button" className="ref-secondary-action" onClick={props.onExportChecklist}><Download size={19} />导出核验清单</button>
        <button type="button" className="ref-secondary-action" onClick={props.goToExecution}><RotateCcw size={18} />返回候选点核验</button>
      </footer>
    </section>
  );
}

function escapeReportText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[match]));
}

function openPrintablePlanningPdf({ type = "report", scenarioLabel, scenarioSites = [], selectedSiteData, agentMemory, scenarioOptions = [] }) {
  const title = type === "checklist" ? "清凉设施候选点核验清单" : "清凉设施选址审议报告";
  const selectedScenario = scenarioOptions.find(([, label]) => label === scenarioLabel) ?? scenarioOptions[0] ?? [];
  const rows = scenarioSites.map((site) => `
    <tr>
      <td>${site.id}</td>
      <td>${escapeReportText(site.name)}</td>
      <td>${escapeReportText(site.facilityType)}</td>
      <td>${escapeReportText(site.people)}</td>
      <td>${escapeReportText(site.score)}</td>
      <td>${escapeReportText(site.status)}</td>
      <td>${escapeReportText(site.tags?.join("；"))}</td>
    </tr>
  `).join("");
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeReportText(title)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; color: #123038; line-height: 1.7; }
          h1 { margin: 0 0 8px; color: #007d75; font-size: 26px; }
          h2 { margin: 22px 0 8px; color: #0b4c54; font-size: 18px; border-bottom: 1px solid #bfe5e1; padding-bottom: 5px; }
          p { margin: 6px 0; }
          .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 18px; margin: 14px 0; padding: 12px; background: #f1fbf9; border: 1px solid #c8e8e4; }
          .metric { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 16px; }
          .metric div { border: 1px solid #c8e8e4; padding: 10px; background: #fbfffe; }
          .metric strong { display: block; color: #00978b; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #cfe7e5; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #ecfaf8; color: #0a5f58; }
          ul { margin-top: 6px; padding-left: 20px; }
          .footer { margin-top: 28px; color: #667d82; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${escapeReportText(title)}</h1>
        <p>项目：滨水老城区高温韧性提升规划</p>
        <div class="meta">
          <div><strong>研究区</strong><br />海淀区</div>
          <div><strong>情景日期</strong><br />2026-07-15</div>
          <div><strong>当前策略</strong><br />${escapeReportText(scenarioLabel)}</div>
          <div><strong>候选设施数量</strong><br />${scenarioSites.length} 个</div>
        </div>

        <h2>一、选址背景</h2>
        <p>本流程面向责任规划师，围绕高温风险、重点人群暴露、现有清凉设施覆盖不足和可复用公共空间，形成候选清凉设施点位与方案比选结果。</p>
        <p>智能体已承接前序治理目标：${escapeReportText(agentMemory?.summary)}</p>

        <h2>二、方法路径</h2>
        <ul>
          <li>空间分析：叠加道路热压力、行为暴露、设施缺口热点和候选设施 POI。</li>
          <li>候选点生成：根据覆盖失效需求权重、推荐功能、用地语境、步行可达改善和人工核验状态排序。</li>
          <li>方案比选：按公平、效率、低成本、应急四类策略筛选设施点，并比较覆盖提升、未覆盖人口减少、步行距离改善和公平性评分。</li>
          <li>人工核验：权属、消防通道、道路红线、开放时间、运维责任仍需由规划师确认。</li>
        </ul>

        <h2>三、当前方案结果</h2>
        <div class="metric">
          <div><span>方案</span><strong>${escapeReportText(scenarioLabel)}</strong></div>
          <div><span>覆盖提升</span><strong>${escapeReportText(selectedScenario[3] ?? "-")}</strong></div>
          <div><span>未覆盖人口减少</span><strong>${escapeReportText(selectedScenario[4] ?? "-")}</strong></div>
          <div><span>步行距离改善</span><strong>${escapeReportText(selectedScenario[5] ?? "-")}</strong></div>
        </div>
        <p>当前重点候选点：${escapeReportText(selectedSiteData?.name ?? "未指定")}；该点仍需结合现场空间、权属和运维条件核验。</p>

        <h2>四、候选点清单</h2>
        <table>
          <thead><tr><th>序号</th><th>候选点</th><th>设施类型</th><th>覆盖人群</th><th>得分</th><th>状态</th><th>关键证据</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='7'>当前方案暂无候选点。</td></tr>"}</tbody>
        </table>

        <h2>五、数据边界与核验事项</h2>
        <ul>
          <li>人口数据、步行网络运行时间和极端高温预测存在不确定性，报告结果应作为审议依据而非自动决策。</li>
          <li>设施类型、建设时序、资金来源、部门协同与最终落地位置仍需人工审定。</li>
          <li>若调整约束或策略，应回到智能体对话中重新生成候选点集合和方案比选结果。</li>
        </ul>

        <p class="footer">生成时间：${new Date().toLocaleString("zh-CN")}。请在浏览器打印窗口中选择“另存为 PDF”。</p>
        <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
      </body>
    </html>`;

  const printWindow = window.open("", "_blank", "width=980,height=1200");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function ReferenceStateCockpit({ agentState, goal, setGoal, onRunGoal }) {
  const [screen, setScreen] = useState("spatial");
  const [version, setVersion] = useState("方案 v2.1");
  const [strategy, setStrategy] = useState("公平优先");
  const [scenarioDate, setScenarioDate] = useState("2026-07-15");
  const [command, setCommand] = useState(goal || defaultAgentMemory.rawInput);
  const [agentMemory, setAgentMemory] = useState(defaultAgentMemory);
  const [agentRagMemory, setAgentRagMemory] = useState(null);
  const [projectMemory, setProjectMemory] = useState(() => createProjectMemory({
    agentState,
    seedMemory: defaultAgentMemory,
    scenarioDate,
    version,
    strategy,
  }));
  const [agentMessages, setAgentMessages] = useState(() => makeInitialAgentMessages(defaultAgentMemory, agentState));
  const [topbarPanel, setTopbarPanel] = useState(null);
  const [planVersions, setPlanVersions] = useState([
    { id: "v2.1", name: "方案 v2.1" },
    { id: "v2.0", name: "方案 v2.0" },
    { id: "v1.0", name: "方案 v1.0" },
  ]);
  const [selectedSite, setSelectedSite] = useState(1);
  const [scenario, setScenario] = useState("fairness");
  const [activeLayers, setActiveLayers] = useState({
    risk: true,
    facility: true,
    gap: true,
    candidate: true,
  });
  const uiCandidateSites = useMemo(() => makeUiCandidateSites(agentState), [agentState]);
  const metrics = useMemo(() => makeUiMetrics(agentState, uiCandidateSites), [agentState, uiCandidateSites]);
  const scenarioOptions = useMemo(() => makeUiScenarios(agentState), [agentState]);
  const scenarioLabel = useMemo(() => getScenarioLabelById(scenarioOptions, scenario), [scenarioOptions, scenario]);
  const scenarioCandidateSites = useMemo(() => makeScenarioCandidateSites(uiCandidateSites, scenario), [scenario, uiCandidateSites]);
  const weather = useLiveWeather();
  const selectedSiteData = useMemo(
    () => uiCandidateSites.find((site) => Number(site.id) === Number(selectedSite)),
    [selectedSite, uiCandidateSites],
  );

  const setScenarioAndSites = (nextScenario) => {
    setScenario(nextScenario);
    const nextSites = makeScenarioCandidateSites(uiCandidateSites, nextScenario);
    if (nextSites[0]) setSelectedSite(nextSites[0].id);
  };

  const toggleLayer = (id) => setActiveLayers((current) => ({ ...current, [id]: !current[id] }));

  const createPlanVersion = () => {
    const nextIndex = Math.max(
      1,
      ...planVersions
        .map((item) => Number(item.name.match(/v2\.(\d+)/)?.[1]))
        .filter(Number.isFinite)
    ) + 1;
    const nextVersion = { id: `v2.${nextIndex}`, name: `方案 v2.${nextIndex}` };
    setPlanVersions((current) => [nextVersion, ...current]);
    setVersion(nextVersion.name);
    setAgentMessages((current) => [
      ...current,
      {
        role: "assistant",
        title: "已新建方案",
        text: `已创建 ${nextVersion.name}。你可以继续输入新的约束或治理目标，我会在这个版本里重新组织候选点和比选结果。`,
        chips: [nextVersion.name, "可继续调整"],
      },
    ]);
  };

  const submitAgentCommand = async (nextCommand) => {
    const text = nextCommand.trim();
    if (!text) return;
    const reusableRagMemory = getReusableRagMemory(projectMemory, agentRagMemory);
    const intentResult = await analyzeAgentIntentWithLLM({
      input: text,
      agentState,
      fallbackStrategy: agentMemory.strategy,
      ragMemory: reusableRagMemory,
      projectMemory: makeProjectMemoryBrief(projectMemory),
      weather,
    });
    const assistantMessage = makeAgentMessageFromIntent(intentResult, agentState);
    setAgentMessages((current) => [
      ...current,
      { role: "user", text },
      assistantMessage,
    ]);
    setProjectMemory((current) => updateProjectMemory({
      currentMemory: current,
      userInput: text,
      assistantMessage,
      intentResult,
      agentState,
      uiState: {
        version,
        scenarioDate,
        scenario,
        selectedSite,
        candidateSites: uiCandidateSites,
      },
    }));
    if (intentResult.ragMemory) {
      setAgentRagMemory(intentResult.ragMemory);
    }

    if (!intentResult.isPlanningRelated || !intentResult.shouldRunWorkflow) {
      return;
    }

    const memory = buildAgentMemoryFromIntent(intentResult, agentMemory);
    setAgentMemory(memory);
    setGoal?.(text);
    setStrategy(memory.strategy);
    if (intentResult.taskType === "constraint_revision") {
      setVersion("方案 v2.2");
      setPlanVersions((current) => current.some((item) => item.name === "方案 v2.2") ? current : [{ id: "v2.2", name: "方案 v2.2" }, ...current]);
    }
    onRunGoal?.(text);
  };

  const submitConstraintCommand = (nextCommand) => {
    const text = nextCommand.trim();
    if (!text) return;
    const memory = inferAgentMemory(text, agentMemory.strategy);
    setCommand("");
    setAgentMemory({ ...memory, taskType: "约束调整" });
    setGoal?.(text);
    setVersion("方案 v2.2");
    setProjectMemory((current) => updateProjectMemory({
      currentMemory: current,
      userInput: text,
      assistantMessage: {
        title: "约束调整",
        text: memory.summary,
      },
      intentResult: {
        isPlanningRelated: true,
        shouldRunWorkflow: true,
        responseType: "constraint_revision",
        taskType: "constraint_revision",
        taskTypeLabel: "约束调整",
        intent: {
          rawUserInput: text,
          targetGroups: memory.targetGroups?.split(/、|,|，/).filter(Boolean) ?? [],
          planningObject: memory.planningObject,
          strategy: memory.strategy,
          constraints: [],
        },
        missingPreconditions: [],
      },
      agentState,
      uiState: {
        version: "方案 v2.2",
        scenarioDate,
        scenario,
        selectedSite,
        candidateSites: uiCandidateSites,
      },
    }));
    onRunGoal?.(text);
    setScreen("comparison");
  };

  const shared = useMemo(() => ({
    version,
    setVersion,
    strategy,
    setStrategy,
    scenarioDate,
    setScenarioDate,
    topbarPanel,
    setTopbarPanel,
    planVersions,
    createPlanVersion,
    activeLayers,
    agentState,
    candidateSites: uiCandidateSites,
    metrics,
    weather,
    scenarioOptions,
    scenarioLabel,
    scenarioCandidateSites,
    toggleLayer,
    selectedSite,
    setSelectedSite,
    scenario,
    setScenario: setScenarioAndSites,
    command,
    setCommand,
    agentMemory,
    projectMemory,
    agentMessages,
    submitAgentCommand,
    submitConstraintCommand,
    goToSpatial: () => setScreen("spatial"),
    goToExecution: () => setScreen("execution"),
    goToComparison: () => setScreen("comparison"),
    onReport: () => {
      openPrintablePlanningPdf({ type: "report", scenarioLabel, scenarioSites: scenarioCandidateSites, selectedSiteData, agentMemory, scenarioOptions });
    },
    onExportChecklist: () => {
      openPrintablePlanningPdf({ type: "checklist", scenarioLabel, scenarioSites: scenarioCandidateSites, selectedSiteData, agentMemory, scenarioOptions });
    },
  }), [activeLayers, agentMemory, agentMessages, agentState, command, metrics, planVersions, projectMemory, scenario, scenarioCandidateSites, scenarioDate, scenarioLabel, scenarioOptions, selectedSite, selectedSiteData, strategy, topbarPanel, uiCandidateSites, version, weather]);

  const content = screen === "execution"
    ? <ExecutionState {...shared} />
    : screen === "comparison"
      ? <ComparisonState {...shared} />
      : <SpatialState {...shared} />;

  return (
    <div className="ref-interactive-root">
      {content}
    </div>
  );
}
