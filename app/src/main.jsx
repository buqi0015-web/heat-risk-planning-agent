import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Layers3,
  MapPin,
  Menu,
  Route,
  ShieldCheck,
  ThermometerSun,
  Users,
  X,
} from "lucide-react";
import "./styles.css";

const NAV_ITEMS = [
  { id: "risk", label: "风险诊断", icon: ThermometerSun },
  { id: "facility", label: "设施与活动核验", icon: Building2 },
  { id: "route", label: "活动路线", icon: Route },
  { id: "scenario", label: "反事实方案", icon: Layers3 },
  { id: "export", label: "报告导出", icon: FileText },
];

const metricCards = [
  { label: "高温暴露人口", value: "12.8万人", meta: "午后高温时段暴露估计", tone: "danger" },
  { label: "设施覆盖率", value: "64%", meta: "15分钟可达清凉设施", tone: "cool" },
  { label: "平均步行绕行距离", value: "420m", meta: "到达清凉节点的额外距离", tone: "neutral" },
  { label: "重点人群影响指数", value: "0.78", meta: "老人、儿童、户外劳动者", tone: "warning" },
];

const diagnosis = {
  explanation:
    "中关村、学院路和西三旗交界片区同时出现高温暴露、步行绕行和设施开放不足，风险不只来自“热”，也来自居民必须完成的通勤、就医、接送学和户外劳动活动。",
  people: ["慢病老人", "接送学家庭", "户外劳动者", "午间通勤人群"],
  gaps: ["遮阴连续性不足", "饮水点稀疏", "可进入休憩空间少", "存量公共设施开放时间不匹配"],
  advice:
    "优先复用党群服务中心、社区卫生服务站和公共文化空间，在高暴露道路补充遮阴、饮水与短暂停留点，并对学校、医院和换乘节点周边形成微型清凉网络。",
};

const comparisonRows = [
  { plan: "现状", coverage: "64%", exposure: "高", detour: "420m", recovery: "基准", note: "识别风险与缺口" },
  { plan: "遮阴设施", coverage: "71%", exposure: "中高", detour: "390m", recovery: "+8%", note: "改善连续步行路径" },
  { plan: "饮水点", coverage: "76%", exposure: "中", detour: "360m", recovery: "+11%", note: "服务户外劳动与通勤" },
  { plan: "休憩点", coverage: "82%", exposure: "中", detour: "310m", recovery: "+16%", note: "支持老人、陪护和接送学" },
  { plan: "路径优化", coverage: "79%", exposure: "中低", detour: "260m", recovery: "+14%", note: "引导低热暴露路径" },
];

const facilityChecks = [
  {
    name: "党群服务中心",
    status: "优先复用",
    service: "室内清凉驿站 + 临时照护",
    evidence: "公共属性强，靠近居住区和高暴露道路",
    check: "开放时段、室内容量、管理排班",
  },
  {
    name: "社区卫生服务站",
    status: "联动开放",
    service: "慢病老人休息 + 饮水补给",
    evidence: "与就医取药活动高度相关，可承接健康脆弱人群",
    check: "候诊空间、午后开放、应急处置责任",
  },
  {
    name: "公共文化空间",
    status: "条件转化",
    service: "休憩点 + 高温信息发布",
    evidence: "具备停留空间，适合作为片区级补充节点",
    check: "空调、座椅、无障碍和产权边界",
  },
  {
    name: "公交站与路侧空间",
    status: "谨慎改造",
    service: "遮阴候停 + 短时补水",
    evidence: "直接嵌入出行路径，能减少暴露中断成本",
    check: "市政权属、道路安全、运维补水频率",
  },
];

const activityCases = [
  { person: "慢病老人", time: "09:30-11:00", activity: "就医、取药、买菜", constraint: "步速慢、热脆弱性高、目的地停留不可压缩", behavior: "倾向选择熟悉路径，绕行容忍低于 300m", planning: "医疗点和菜市场周边需要可进入休憩点" },
  { person: "接送学家庭", time: "15:30-17:30", activity: "接送学、等待、短距离步行", constraint: "时间刚性强，停留位置由校门和等候区决定", behavior: "即使路过清凉设施，也可能因接送任务不进入", planning: "学校周边要优先补遮阴等候和短时座椅" },
  { person: "户外劳动者", time: "11:00-16:00", activity: "配送、巡查、保洁", constraint: "路线连续、任务密集，暴露时间随订单或巡查段累积", behavior: "更需要沿途低成本短暂停留，不依赖目的地休憩", planning: "高暴露道路边需要饮水点和短停节点" },
];

const routeCases = [
  {
    id: "agent_000050_act_02",
    label: "老人陪医取药",
    origin: "北京市海淀医院",
    destination: "中医医院采样点",
    time: "11:37",
    distance: "7.3km",
    exposure: "198.7",
    failed: "目的地停留热暴露高",
    adjustment: "增加卫生服务站联动休憩点，路径优先经过遮阴道路",
  },
  {
    id: "agent_000074_act_01",
    label: "接送学陪护",
    origin: "乘服公寓",
    destination: "风车汇智学校",
    time: "10:46",
    distance: "1.5km",
    exposure: "72.7",
    failed: "学校周边等候暴露",
    adjustment: "在学校周边 150m 范围内布置遮阴和短时座椅",
  },
  {
    id: "agent_000040_act_02",
    label: "户外配送",
    origin: "菜鸟驿站",
    destination: "果真鲜生活超市",
    time: "14:55",
    distance: "6.9km",
    exposure: "63.9",
    failed: "连续道路边热暴露",
    adjustment: "沿高暴露路径设置饮水与短暂停留点",
  },
];

const counterfactualCards = [
  { name: "现状基线", exposure: "高", coverage: "64%", change: "无干预", note: "识别高温治理失效区域和主要受影响活动。" },
  { name: "遮阴优先", exposure: "中高", coverage: "71%", change: "活动失效 -8%", note: "降低学校、公交站、医院周边等待暴露。" },
  { name: "饮水点优先", exposure: "中", coverage: "76%", change: "户外劳动风险 -11%", note: "服务配送、巡查和午间通勤的连续路径。" },
  { name: "存量复用组合", exposure: "中低", coverage: "82%", change: "设施覆盖 +18%", note: "将党群服务中心、卫生服务站转化为清凉节点。" },
];

const plannerGoalPresets = [
  {
    id: "elder-school",
    label: "老人 + 接送学",
    prompt: "优先保障老人和接送学家庭，应该在哪里布置清凉设施？",
    layer: "facility",
  },
  {
    id: "outdoor-workers",
    label: "户外劳动者",
    prompt: "针对配送、巡查和保洁等户外劳动者，如何布置连续饮水与短暂停留点？",
    layer: "route",
  },
  {
    id: "reuse-first",
    label: "存量复用",
    prompt: "如果优先复用党群服务中心、卫生服务站和公共文化空间，哪些点位最值得先改造？",
    layer: "facility",
  },
];

const dynamicPlanProfiles = {
  "elder-school": {
    intent: "识别出重点对象为慢病老人和接送学家庭，约束被转译为低绕行、近医疗与近学校、可停留、遮阴优先。",
    weights: ["重点人群覆盖 +35%", "时间刚性 +25%", "绕行距离 +20%", "存量复用 +20%"],
    recommendation:
      "优先在学院路-中关村南部、学校周边等候空间、社区卫生服务站周边布置遮阴与短暂停留设施，形成可到达、可等待、可陪护的清凉节点。",
    selected: [
      { name: "学院路学校周边等候点", type: "遮阴 + 座椅", reason: "接送学活动时间刚性强，校门口附近绕行容忍最低。" },
      { name: "社区卫生服务站联动点", type: "休憩 + 饮水", reason: "慢病老人就医路径需要短暂停留和健康服务联动。" },
      { name: "党群服务中心复合点", type: "清凉驿站", reason: "具备公共服务属性，适合承接室内避暑和应急照护。" },
    ],
    risks: ["需核验学校周边可布置空间", "卫生服务站开放时间需确认", "党群服务中心容量需现场复核"],
  },
  "outdoor-workers": {
    intent: "识别出重点对象为户外劳动者，约束被转译为沿路连续覆盖、补水便利、短暂停留和路径暴露中断。",
    weights: ["高暴露路径中断 +40%", "饮水可达 +25%", "连续覆盖 +20%", "实施成本 +15%"],
    recommendation:
      "优先沿高暴露道路和配送巡查密集路径布置饮水点、遮阴候停点和短时休息点，降低连续道路边热暴露。",
    selected: [
      { name: "高暴露道路交汇点", type: "饮水 + 遮阴", reason: "路径经过频次高，能中断连续热暴露。" },
      { name: "公交站复合候停点", type: "遮阴候车", reason: "具备公共性和路侧可达性，改造成本较低。" },
      { name: "公园入口服务点", type: "短暂停留", reason: "靠近绿色空间，可作为补水和恢复节点。" },
    ],
    risks: ["路侧设施需核验市政权属", "饮水点运维主体需明确", "夜间开放能力暂未纳入"],
  },
  "reuse-first": {
    intent: "识别出治理目标为低成本存量复用，约束被转译为公共性、开放时间、容量、道路可达和功能嵌入潜力。",
    weights: ["存量复用潜力 +35%", "公共性 +25%", "设施容量 +20%", "需求覆盖 +20%"],
    recommendation:
      "优先从党群服务中心、公共文化空间、卫生服务站和交通节点中筛选可快速嵌入清凉功能的点位，形成首批低成本改造清单。",
    selected: [
      { name: "党群服务中心", type: "室内清凉驿站", reason: "公共属性强，适合成为街道级服务锚点。" },
      { name: "公共文化空间", type: "休憩 + 信息发布", reason: "具备停留空间，可承接高温预警和临时避暑。" },
      { name: "公交站点", type: "遮阴 + 饮水", reason: "靠近日常路径，适合补齐路侧短板。" },
    ],
    risks: ["需要现场核验空调与座椅", "开放时段可能与高温时段错位", "管理主体需街道协调"],
  },
};

const strategyLabels = {
  equity: "公平优先",
  coverage: "覆盖优先",
  reuse: "存量复用优先",
  cost: "低成本优先",
};

const strategyColors = {
  equity: "#0f8f8f",
  coverage: "#ef5a3c",
  reuse: "#1f7a4f",
  cost: "#f4a340",
};

const showcaseDataUrl = `${import.meta.env.BASE_URL}data/showcase.json`;

function MetricCard({ item }) {
  return (
    <article className={`planner-metric planner-metric--${item.tone}`}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.meta}</small>
    </article>
  );
}

function Sidebar({ active, setActive, open, setOpen }) {
  return (
    <aside className={`sidebar planner-sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand">
        <div className="brand__mark"><ThermometerSun aria-hidden="true" size={22} /></div>
        <div><strong>高温设施规划 Agent</strong><span>Planner Copilot</span></div>
        <button className="icon-button mobile-only" aria-label="关闭导航" onClick={() => setOpen(false)}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <nav aria-label="主要导航">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={active === id ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => { setActive(id); setOpen(false); }}
          >
            <Icon aria-hidden="true" size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__foot">
        <span>项目状态</span>
        <div className="progress"><span /></div>
        <strong>Demo mock data</strong>
        <small>面向责任规划师的高温治理工作台</small>
      </div>
    </aside>
  );
}

function Header({ active, setMenuOpen }) {
  const label = NAV_ITEMS.find((item) => item.id === active)?.label ?? "风险诊断";
  return (
    <header className="topbar planner-topbar">
      <button className="icon-button mobile-only" aria-label="打开导航" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" size={19} />
      </button>
      <div className="topbar__context">
        <span>海淀区 · 典型高温日</span>
        <strong>{label}</strong>
      </div>
      <div className="topbar__status"><span aria-hidden="true" />Agent 诊断已生成</div>
    </header>
  );
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

function activityPointsToGeoJSON(activities = []) {
  const features = [];
  activities.forEach((activity) => {
    if (Number.isFinite(activity.origin_lon) && Number.isFinite(activity.origin_lat)) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.origin_lon, activity.origin_lat] },
        properties: {
          kind: "origin",
          label: activity.agent_label,
          name: activity.origin_name,
          status: activity.activity_status,
        },
      });
    }
    if (Number.isFinite(activity.destination_lon) && Number.isFinite(activity.destination_lat)) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.destination_lon, activity.destination_lat] },
        properties: {
          kind: "destination",
          label: activity.agent_label,
          name: activity.destination_name,
          status: activity.activity_status,
        },
      });
    }
  });
  return { type: "FeatureCollection", features };
}

function segmentsToGeoJSON(segments = []) {
  return {
    type: "FeatureCollection",
    features: segments
      .filter((segment) => (
        Number.isFinite(segment.from_lon)
        && Number.isFinite(segment.from_lat)
        && Number.isFinite(segment.to_lon)
        && Number.isFinite(segment.to_lat)
      ))
      .map((segment) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[segment.from_lon, segment.from_lat], [segment.to_lon, segment.to_lat]],
        },
        properties: {
          activity_id: segment.activity_id,
          road_name: segment.road_name ?? "未命名道路",
          heat_stress: Number(segment.heat_stress ?? 0),
          segment_heat_exposure: Number(segment.segment_heat_exposure ?? 0),
        },
      })),
  };
}

function valueOf(properties, key, fallback = 0) {
  const value = Number(properties?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function normalize(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return (value - min) / (max - min);
}

function enrichFacilitiesWithStrategyScores(collection) {
  const features = collection?.features ?? [];
  if (!features.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const weights = features.map((feature) => valueOf(feature.properties, "effective_covered_demand_weight"));
  const snapDistances = features.map((feature) => valueOf(feature.properties, "road_snap_distance_m"));
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const minSnap = Math.min(...snapDistances);
  const maxSnap = Math.max(...snapDistances);

  const scoredFeatures = features.map((feature) => {
    const p = feature.properties ?? {};
    const coveredWeight = normalize(valueOf(p, "effective_covered_demand_weight"), minWeight, maxWeight);
    const roadAccess = 1 - normalize(valueOf(p, "road_snap_distance_m"), minSnap, maxSnap);
    const publicness = valueOf(p, "publicness_multiplier", 0.75);
    const readiness = valueOf(p, "operational_readiness", 0.5);
    const reuse = valueOf(p, "reuse_potential", 0);
    const demand = valueOf(p, "demand_match", 0);
    const failureCoverage = valueOf(p, "failure_demand_coverage", 0);
    const exposureInterruption = valueOf(p, "exposure_interruption", 0);
    const vulnerable = valueOf(p, "vulnerable_relevance", 0);
    const scarcity = valueOf(p, "scarcity_improvement", 0);

    return {
      ...feature,
      properties: {
        ...p,
        score_equity: 0.32 * failureCoverage + 0.24 * demand + 0.2 * vulnerable + 0.14 * scarcity + 0.1 * roadAccess,
        score_coverage: 0.42 * failureCoverage + 0.3 * coveredWeight + 0.18 * exposureInterruption + 0.1 * demand,
        score_reuse: 0.42 * reuse + 0.22 * readiness + 0.2 * publicness + 0.1 * demand + 0.06 * roadAccess,
        score_cost: 0.34 * readiness + 0.26 * roadAccess + 0.18 * publicness + 0.14 * reuse + 0.08 * scarcity,
      },
    };
  });

  ["equity", "coverage", "reuse", "cost"].forEach((strategy) => {
    const key = `score_${strategy}`;
    const ranked = [...scoredFeatures].sort((a, b) => valueOf(b.properties, key) - valueOf(a.properties, key));
    ranked.forEach((feature, index) => {
      feature.properties[`rank_${strategy}`] = index + 1;
      feature.properties[`selected_${strategy}`] = index < 12 ? 1 : 0;
    });
  });

  return { type: "FeatureCollection", features: scoredFeatures };
}

function setLayerVisibility(map, layerIds, visible) {
  layerIds.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
}

function MapLibreHeatMap({ activeLayer, setActiveLayer, strategy }) {
  const layerLabels = {
    heat: "热风险",
    people: "重点人群",
    facility: "设施缺口",
    route: "高暴露路径",
  };
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [mapState, setMapState] = useState("loading");

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    let cancelled = false;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e9f1f2" },
          },
        ],
      },
      center: [116.3, 39.98],
      zoom: 10.4,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    fetch(showcaseDataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`showcase.json ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const routeSegments = segmentsToGeoJSON(data.segments);
        const activityPoints = activityPointsToGeoJSON(data.activities);
        const facilities = enrichFacilitiesWithStrategyScores(
          data.site_selection?.facility_scenarios_geojson ?? { type: "FeatureCollection", features: [] },
        );

        const addShowcaseLayers = () => {
          if (cancelled) return;
          if (map.getSource("roads")) return;

          map.addSource("osm", {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          });
          map.addSource("landuse", { type: "geojson", data: data.local_landuse_basemap });
          map.addSource("boundary", { type: "geojson", data: data.boundary });
          map.addSource("roads", { type: "geojson", data: data.roads });
          map.addSource("routeSegments", { type: "geojson", data: routeSegments });
          map.addSource("activityPoints", { type: "geojson", data: activityPoints });
          map.addSource("facilities", { type: "geojson", data: facilities });

          map.addLayer({
            id: "osm-basemap",
            type: "raster",
            source: "osm",
            paint: {
              "raster-opacity": 0.64,
              "raster-saturation": -0.35,
            },
          });

          map.addLayer({
            id: "landuse-fill",
            type: "fill",
            source: "landuse",
            paint: {
              "fill-color": [
                "match",
                ["get", "euluc_label"],
                "公园绿地", "#9bc7a8",
                "居住用地", "#dce7ec",
                "教育用地", "#c9def4",
                "医疗用地", "#f2c9c0",
                "商务办公用地", "#e2d5f1",
                "交通用地", "#e2e6e8",
                "#eef3f3",
              ],
              "fill-opacity": 0.42,
            },
          });

          map.addLayer({
            id: "roads-base",
            type: "line",
            source: "roads",
            paint: {
              "line-color": "#a8b7b7",
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 13, 1.15, 15, 2],
              "line-opacity": 0.42,
            },
          });

          map.addLayer({
            id: "roads-heat",
            type: "line",
            source: "roads",
            filter: [">", ["coalesce", ["get", "has_heat_data"], 0], 0],
            paint: {
              "line-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "effective_heat_stress"], 0],
                0, "#1aa6a6",
                0.45, "#e2b84c",
                0.7, "#f46a42",
                1, "#c94735",
              ],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.75, 13, 1.65, 15, 3.2],
              "line-opacity": 0.92,
            },
          });

          map.addLayer({
            id: "route-segments",
            type: "line",
            source: "routeSegments",
            paint: {
              "line-color": [
                "interpolate",
                ["linear"],
                ["get", "heat_stress"],
                0, "#18a999",
                0.5, "#e2b84c",
                0.75, "#f46a42",
                1, "#c94735",
              ],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 13, 2.4, 15, 4.2],
              "line-opacity": 0.86,
            },
          });

          map.addLayer({
            id: "activity-points",
            type: "circle",
            source: "activityPoints",
            paint: {
              "circle-color": ["case", ["==", ["get", "status"], "failed"], "#f46a42", "#1aa6a6"],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 4, 15, 6],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
              "circle-opacity": 0.78,
            },
          });

          map.addLayer({
            id: "facility-points",
            type: "circle",
            source: "facilities",
            paint: {
              "circle-color": "#7e9da4",
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 13, 3.8, 15, 5.4],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 0.8,
              "circle-opacity": 0.42,
            },
          });

          map.addLayer({
            id: "facility-selected",
            type: "circle",
            source: "facilities",
            filter: ["==", ["get", `selected_${strategy}`], 1],
            paint: {
              "circle-color": strategyColors[strategy] ?? strategyColors.equity,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4.6, 13, 7, 15, 10],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.96,
            },
          });

          map.addLayer({
            id: "boundary-line",
            type: "line",
            source: "boundary",
            paint: {
              "line-color": "#0f2742",
              "line-width": 2,
              "line-opacity": 0.7,
            },
          });

          map.on("mouseenter", "roads-heat", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "roads-heat", () => { map.getCanvas().style.cursor = ""; });
          map.on("click", "roads-heat", (event) => {
            const feature = event.features?.[0];
            if (!feature) return;
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true })
              .setLngLat(event.lngLat)
              .setHTML(`<b>${feature.properties.road_name || "道路"}</b><span>有效热压力：${Number(feature.properties.effective_heat_stress ?? 0).toFixed(2)}</span>`)
              .addTo(map);
          });

          const bounds = bboxFromFeatureCollection(data.boundary);
          if (!bounds.isEmpty()) {
            map.resize();
            map.fitBounds(bounds, { padding: 28, duration: 0 });
            window.setTimeout(() => {
              if (!cancelled) {
                map.resize();
                map.fitBounds(bounds, { padding: 28, duration: 0 });
              }
            }, 120);
          }
          setMapState("ready");
        };

        if (map.loaded()) {
          addShowcaseLayers();
        } else {
          map.once("load", addShowcaseLayers);
        }
      })
      .catch(() => {
        if (!cancelled) setMapState("error");
      });

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setLayerVisibility(map, ["roads-heat"], activeLayer === "heat" || activeLayer === "route");
    setLayerVisibility(map, ["route-segments"], activeLayer === "route");
    setLayerVisibility(map, ["activity-points"], activeLayer === "people" || activeLayer === "route");
    setLayerVisibility(map, ["facility-points", "facility-selected"], activeLayer === "facility" || activeLayer === "route");
    setLayerVisibility(map, ["landuse-fill"], activeLayer !== "route");
    if (map.getLayer("facility-selected")) {
      map.setFilter("facility-selected", ["==", ["get", `selected_${strategy}`], 1]);
      map.setPaintProperty("facility-selected", "circle-color", strategyColors[strategy] ?? strategyColors.equity);
    }
  }, [activeLayer, mapState, strategy]);

  return (
    <article className="planner-map-card">
      <div className="planner-panel-heading">
        <div>
          <span>热风险地图工作台</span>
          <h2>从空间热暴露定位到设施响应单元</h2>
        </div>
        <div className="planner-layer-tabs">
          {Object.entries(layerLabels).map(([id, label]) => (
            <button
              key={id}
              className={activeLayer === id ? "planner-layer-tab planner-layer-tab--active" : "planner-layer-tab"}
              onClick={() => setActiveLayer(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="real-map-shell">
        <div ref={mapContainerRef} className="real-map" aria-label="海淀区道路热风险地图" />
        {mapState === "loading" && <div className="real-map__state">正在加载道路与热暴露数据...</div>}
        {mapState === "error" && <div className="real-map__state real-map__state--error">地图数据加载失败，请检查 public/data/showcase.json</div>}
        <div className="map-legend-panel real-map__legend" aria-label="地图图例">
          <div className="map-legend-group">
            <strong>选址候选点</strong>
            <span>
              <i className="legend-point-current" style={{ "--legend-point-color": strategyColors[strategy] ?? strategyColors.equity }} />
              {strategyLabels[strategy]}推荐点
            </span>
            <span><i className="legend-point-muted" />其他候选点</span>
          </div>
          <div className="map-legend-rule" />
          <div className="map-legend-group map-legend-group--roads">
            <strong>道路热压力</strong>
            <span><i className="legend-risk" />高温风险道路</span>
            <span><i className="legend-cool" />居民活动/清凉设施</span>
            <span><i className="legend-route" />活动路径分段</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function routeEndpointsToGeoJSON(activity) {
  if (!activity) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.origin_lon, activity.origin_lat] },
        properties: { kind: "origin", name: activity.origin_name, label: "活动起点" },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [activity.destination_lon, activity.destination_lat] },
        properties: { kind: "destination", name: activity.destination_name, label: "活动目的地" },
      },
    ].filter((feature) => (
      Number.isFinite(feature.geometry.coordinates[0])
      && Number.isFinite(feature.geometry.coordinates[1])
    )),
  };
}

function RouteCaseMap({ activityId }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [mapState, setMapState] = useState("loading");

  useEffect(() => {
    if (!mapContainerRef.current) return undefined;

    let cancelled = false;
    setMapState("loading");

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e9f1f2" },
          },
        ],
      },
      center: [116.3, 39.98],
      zoom: 13,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    fetch(showcaseDataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`showcase.json ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const activity = data.activities?.find((item) => item.activity_id === activityId);
        const routeSegments = segmentsToGeoJSON(
          (data.segments ?? [])
            .filter((segment) => segment.activity_id === activityId)
            .sort((a, b) => Number(a.segment_sequence ?? 0) - Number(b.segment_sequence ?? 0)),
        );
        const endpoints = routeEndpointsToGeoJSON(activity);

        const addRouteLayers = () => {
          if (cancelled) return;

          map.addSource("osm", {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          });
          map.addSource("routeSegments", { type: "geojson", data: routeSegments });
          map.addSource("routeEndpoints", { type: "geojson", data: endpoints });

          map.addLayer({
            id: "osm-basemap",
            type: "raster",
            source: "osm",
            paint: {
              "raster-opacity": 0.72,
              "raster-saturation": -0.28,
            },
          });

          map.addLayer({
            id: "route-shadow",
            type: "line",
            source: "routeSegments",
            paint: {
              "line-color": "#0f2742",
              "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5.5, 15, 8],
              "line-opacity": 0.2,
            },
          });

          map.addLayer({
            id: "route-heat-line",
            type: "line",
            source: "routeSegments",
            paint: {
              "line-color": [
                "interpolate",
                ["linear"],
                ["get", "heat_stress"],
                0, "#18a999",
                0.5, "#e2b84c",
                0.75, "#f46a42",
                1, "#c94735",
              ],
              "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3.4, 15, 6],
              "line-opacity": 0.96,
            },
          });

          map.addLayer({
            id: "route-endpoints",
            type: "circle",
            source: "routeEndpoints",
            paint: {
              "circle-color": ["case", ["==", ["get", "kind"], "origin"], "#0f8f8f", "#ef5a3c"],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 6, 15, 9],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          map.on("mouseenter", "route-heat-line", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "route-heat-line", () => { map.getCanvas().style.cursor = ""; });
          map.on("click", "route-heat-line", (event) => {
            const feature = event.features?.[0];
            if (!feature) return;
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true })
              .setLngLat(event.lngLat)
              .setHTML(`<b>${feature.properties.road_name || "活动路径分段"}</b><span>热压力：${Number(feature.properties.heat_stress ?? 0).toFixed(2)}</span>`)
              .addTo(map);
          });

          const bounds = bboxFromFeatureCollection({
            type: "FeatureCollection",
            features: [...routeSegments.features, ...endpoints.features],
          });
          if (!bounds.isEmpty()) {
            map.resize();
            map.fitBounds(bounds, {
              padding: { top: 70, bottom: 54, left: 54, right: 54 },
              maxZoom: 15.4,
              duration: 0,
            });
          }
          setMapState("ready");
        };

        if (map.loaded()) {
          addRouteLayers();
        } else {
          map.once("load", addRouteLayers);
        }
      })
      .catch(() => {
        if (!cancelled) setMapState("error");
      });

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [activityId]);

  return (
    <article className="planner-map-card route-case-card">
      <div className="planner-panel-heading">
        <div>
          <span>活动路线图</span>
          <h2>查看单次活动如何沿道路累计热暴露</h2>
        </div>
      </div>
      <div className="real-map-shell route-case-map-shell">
        <div ref={mapContainerRef} className="real-map" aria-label="居民活动路线图" />
        {mapState === "loading" && <div className="real-map__state">正在加载该活动的道路分段...</div>}
        {mapState === "error" && <div className="real-map__state real-map__state--error">路线数据加载失败，请检查 activity_id 与 segments</div>}
        <div className="route-case-legend">
          <span><i className="origin-dot" />活动起点</span>
          <span><i className="destination-dot" />活动目的地</span>
          <span><i className="legend-route" />道路热压力分段</span>
        </div>
      </div>
    </article>
  );
}

function AgentDiagnosisPanel({ activePlan, setActivePlan, plannerQuestion, setPlannerQuestion, strategy, setStrategy, onGenerate }) {
  const plan = dynamicPlanProfiles[activePlan];

  return (
    <aside className="planner-agent-panel">
      <div className="planner-panel-heading planner-panel-heading--stack">
        <span>目标驱动选址 Agent</span>
        <h2>把静态候选点转成动态治理方案</h2>
      </div>
      <section className="agent-goal-box">
        <label htmlFor="planner-question">规划师输入治理目标</label>
        <textarea
          id="planner-question"
          value={plannerQuestion}
          onChange={(event) => setPlannerQuestion(event.target.value)}
          rows={4}
        />
        <div className="agent-preset-row">
          {plannerGoalPresets.map((preset) => (
            <button
              key={preset.id}
              className={activePlan === preset.id ? "agent-preset agent-preset--active" : "agent-preset"}
              onClick={() => {
                setActivePlan(preset.id);
                setPlannerQuestion(preset.prompt);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="agent-control-grid">
          <label>
            选址策略
            <select value={strategy} onChange={(event) => setStrategy(event.target.value)}>
              <option value="equity">公平优先</option>
              <option value="coverage">覆盖优先</option>
              <option value="reuse">存量复用优先</option>
              <option value="cost">低成本优先</option>
            </select>
          </label>
          <button className="planner-export-button agent-run-button" onClick={onGenerate}>
            生成方案
          </button>
        </div>
      </section>
      <div className="agent-result-scroll">
        <section className="diagnosis-block">
          <h3>推荐设施组合</h3>
          <div className="agent-site-list">
            {plan.selected.map((site) => (
              <article key={site.name}>
                <strong>{site.name}</strong>
                <span>{site.type}</span>
                <p>{site.reason}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="diagnosis-block diagnosis-block--risk">
          <h3>LLM 意图转译</h3>
          <p>{plan.intent}</p>
        </section>
        <section className="diagnosis-block">
          <h3>动态权重调整</h3>
          <div className="planner-tags">
            <span>当前策略：{strategyLabels[strategy]}</span>
          {plan.weights.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>
        <section className="diagnosis-block diagnosis-block--advice">
          <h3>规划建议</h3>
          <p>{plan.recommendation}</p>
        </section>
        <section className="diagnosis-block">
          <h3>待人工核验</h3>
          <ul>{plan.risks.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section className="agent-boundary-note">
          LLM 只负责目标理解、权重转译、方案组织和理由生成；点位、道路热暴露、候选设施和覆盖结果来自 GIS 与规则模型。
        </section>
      </div>
    </aside>
  );
}

function PlanComparisonTable() {
  return (
    <article className="planner-table-card">
      <div className="planner-panel-heading">
        <div>
          <span>方案对比</span>
          <h2>不同设施响应对风险缓解的模拟效果</h2>
        </div>
        <button className="planner-export-button"><Download size={16} />导出报告</button>
      </div>
      <div className="planner-table-wrap">
        <table className="planner-table">
          <thead>
            <tr>
              <th>方案</th>
              <th>设施覆盖率</th>
              <th>热暴露等级</th>
              <th>平均绕行距离</th>
              <th>活动恢复</th>
              <th>规划含义</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.plan}>
                <td>{row.plan}</td>
                <td>{row.coverage}</td>
                <td><span className={row.exposure.includes("高") ? "risk-text" : "cool-text"}>{row.exposure}</span></td>
                <td>{row.detour}</td>
                <td>{row.recovery}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function FacilityView() {
  return (
    <section className="planner-section-card facility-demand-card">
      <div className="planner-panel-heading">
        <div><span>设施与活动核验</span><h2>先判断活动需求，再核验哪些设施能承接清凉功能</h2></div>
      </div>

      <div className="activity-scenario-list activity-scenario-list--compact">
        {activityCases.map((item) => (
          <article key={item.person}>
            <div className="activity-scenario__role">
              <Users size={18} />
              <div>
                <h3>{item.person}</h3>
                <span>{item.time}</span>
              </div>
            </div>
            <div className="activity-scenario__body">
              <p><b>活动链</b>{item.activity}</p>
              <p><b>行为约束</b>{item.constraint}</p>
              <p><b>模拟判断</b>{item.behavior}</p>
            </div>
            <strong>{item.planning}</strong>
          </article>
        ))}
      </div>

      <div className="section-divider-label">可承接设施核验</div>

      <div className="facility-audit-layout">
        {facilityChecks.map((item) => (
          <article key={item.name}>
            <CheckCircle2 size={18} />
            <div>
              <h3>{item.name}</h3>
              <strong>{item.status}</strong>
            </div>
            <dl>
              <div><dt>可承接功能</dt><dd>{item.service}</dd></div>
              <div><dt>空间依据</dt><dd>{item.evidence}</dd></div>
              <div><dt>人工核验</dt><dd>{item.check}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <div className="facility-verification-strip">
        {["公共属性", "开放时间", "室内容量", "步行可达", "改造成本", "运维主体"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function ActivityRouteView() {
  const [selectedRoute, setSelectedRoute] = useState(routeCases[1].id);
  const route = routeCases.find((item) => item.id === selectedRoute) ?? routeCases[0];

  return (
    <>
      <section className="planner-route-toolbar">
        <label>
          活动路线案例
          <select value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)}>
            {routeCases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="route-summary-strip">
          <span>{route.origin}</span>
          <Route size={18} />
          <span>{route.destination}</span>
        </div>
        <strong>{route.time} · {route.distance}</strong>
      </section>

      <section className="planner-main-grid planner-main-grid--route">
        <RouteCaseMap activityId={route.id} />
        <aside className="route-inspector planner-section-card">
          <div className="planner-panel-heading planner-panel-heading--stack">
            <span>活动路线诊断</span>
            <h2>{route.label}</h2>
          </div>
          <div className="route-inspector__score">
            <span>路径累计热暴露</span>
            <strong>{route.exposure}</strong>
            <small>{route.failed}</small>
          </div>
          <div className="route-inspector__timeline">
            {["出发点语义核验", "路网可达路径生成", "逐道路边热暴露累计", "活动失效原因判断", "清凉设施响应建议"].map((item, index) => (
              <div key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <section className="diagnosis-block diagnosis-block--advice">
            <h3>Agent 路线解释</h3>
            <p>{route.adjustment}</p>
          </section>
        </aside>
      </section>
    </>
  );
}

function CounterfactualView() {
  return (
    <>
      <section className="counterfactual-board">
        <div className="planner-panel-heading">
          <div><span>反事实方案</span><h2>比较“如果这样干预”，活动失效会不会减少</h2></div>
        </div>
        <div className="counterfactual-card-grid">
          {counterfactualCards.map((item, index) => (
            <article key={item.name} className={index === 0 ? "counterfactual-card counterfactual-card--base" : "counterfactual-card"}>
              <span>{item.name}</span>
              <div>
                <strong>{item.coverage}</strong>
                <small>设施覆盖率</small>
              </div>
              <p><b>{item.exposure}</b>热暴露等级 · {item.change}</p>
              <em>{item.note}</em>
            </article>
          ))}
        </div>
      </section>
      <section className="counterfactual-logic-grid">
        <article className="planner-section-card">
          <div className="planner-panel-heading">
            <div><span>推演逻辑</span><h2>只改变设施干预条件，保持居民活动需求不变</h2></div>
          </div>
          <div className="scenario-step-list">
            {[
              ["基线", "保留现状道路热暴露、居民活动链和已有设施开放条件"],
              ["干预", "分别加入遮阴、饮水、休憩点和路径优化方案"],
              ["重算", "重新计算设施可达、绕行距离、路径热暴露和活动恢复"],
              ["审议", "输出收益、成本、待核验事项和可能副作用"],
            ].map(([title, text]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </article>
        <article className="planner-section-card">
          <div className="planner-panel-heading">
            <div><span>Agent 输出</span><h2>把模型结果组织成可讨论的治理选项</h2></div>
          </div>
          <div className="scenario-agent-note">
            <AlertTriangle size={20} />
            <p>优先推荐“存量复用组合”作为首轮试点，原因是覆盖提升明显、实施成本较低，同时可以通过党群服务中心和卫生服务站快速形成可管理的清凉服务网络。</p>
          </div>
        </article>
      </section>
      <PlanComparisonTable />
    </>
  );
}

function ExportView() {
  return (
    <section className="planner-section-card">
      <div className="planner-panel-heading">
        <div><span>报告导出</span><h2>面向会议汇报与方案审议的一页式材料</h2></div>
      </div>
      <div className="export-card">
        <FileText size={28} />
        <div>
          <h3>高温设施规划 Agent 诊断报告</h3>
          <p>包含风险地图、影响人群、设施缺口、方案对比、待核验事项与实施建议。</p>
        </div>
        <button className="planner-export-button"><Download size={16} />生成 PDF</button>
      </div>
    </section>
  );
}

function PlannerDashboard({ active }) {
  const [activeLayer, setActiveLayer] = useState("heat");
  const [activePlan, setActivePlan] = useState("elder-school");
  const [plannerQuestion, setPlannerQuestion] = useState(plannerGoalPresets[0].prompt);
  const [strategy, setStrategy] = useState("equity");
  const pageTitle = useMemo(() => {
    if (active === "facility") return "设施与活动核验";
    if (active === "route") return "活动路线";
    if (active === "scenario") return "反事实方案";
    if (active === "export") return "报告导出";
    return "高温设施规划 Agent";
  }, [active]);
  const handleGeneratePlan = () => {
    const preset = plannerGoalPresets.find((item) => item.id === activePlan);
    setActiveLayer(preset?.layer ?? "facility");
  };

  return (
    <main id="main-content" className="planner-workspace">
      <section className="planner-hero">
        <div>
          <span className="eyebrow">Responsible Planner Agent</span>
          <h1>{pageTitle}</h1>
          <p>从“哪里热”到“影响了谁、阻碍了什么活动、设施如何响应”</p>
        </div>
        <div className="planner-hero__note">
          <ShieldCheck size={20} />
          <span>GIS核验空间事实，受约束LLM组织居民活动情境、解释问题并生成可审议证据。</span>
        </div>
      </section>

      <section className="planner-metric-grid">
        {metricCards.map((item) => <MetricCard key={item.label} item={item} />)}
      </section>

      {active === "facility" && <FacilityView />}
      {active === "route" && <ActivityRouteView />}
      {active === "scenario" && <CounterfactualView />}
      {active === "export" && <ExportView />}

      {active === "risk" && (
        <>
          <section className="planner-main-grid">
            <MapLibreHeatMap activeLayer={activeLayer} setActiveLayer={setActiveLayer} strategy={strategy} />
            <AgentDiagnosisPanel
              activePlan={activePlan}
              setActivePlan={setActivePlan}
              plannerQuestion={plannerQuestion}
              setPlannerQuestion={setPlannerQuestion}
              strategy={strategy}
              setStrategy={(nextStrategy) => {
                setStrategy(nextStrategy);
                setActiveLayer("facility");
              }}
              onGenerate={handleGeneratePlan}
            />
          </section>
          <PlanComparisonTable />
        </>
      )}
    </main>
  );
}

function App() {
  const [active, setActive] = useState("risk");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell planner-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} setOpen={setMenuOpen} />
      <div className="app-main">
        <Header active={active} setMenuOpen={setMenuOpen} />
        <PlannerDashboard active={active} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
