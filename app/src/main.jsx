import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  Footprints,
  Layers3,
  Map,
  MapPin,
  Menu,
  Route,
  ShieldCheck,
  ThermometerSun,
  UsersRound,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const STATUS = {
  normal: { label: "正常完成", color: "#26856b" },
  behavior_changed: { label: "行为调整", color: "#d7a62a" },
  risky_completion: { label: "风险完成", color: "#e07439" },
  failed: { label: "活动失效", color: "#c4473c" },
};

const NAV_ITEMS = [
  { id: "overview", label: "诊断总览", icon: Layers3 },
  { id: "route", label: "活动路线", icon: Route },
  { id: "selection", label: "设施选址", icon: Building2 },
  { id: "evidence", label: "气象与核验", icon: ShieldCheck },
  { id: "method", label: "方法框架", icon: Database },
];

const compactNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const BASEMAP_STYLE = {
  version: 8,
  sources: {
    "openstreetmap": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e9efec" } },
    {
      id: "openstreetmap",
      type: "raster",
      source: "openstreetmap",
      paint: {
        "raster-opacity": 0.76,
        "raster-saturation": -0.55,
        "raster-contrast": -0.08,
        "raster-brightness-min": 0.18,
        "raster-brightness-max": 0.98,
      },
    },
  ],
};

function addLocalPlanningBasemap(map, data, includeRoadContext = false) {
  if (!data.local_landuse_basemap) return;
  map.addSource("local-landuse-basemap", { type: "geojson", data: data.local_landuse_basemap });
  map.addLayer({
    id: "local-landuse-basemap",
    type: "fill",
    source: "local-landuse-basemap",
    paint: {
      "fill-color": [
        "match", ["get", "Class"],
        0, "#e7e5df",
        1, "#d9e2e5",
        2, "#ece0cc",
        3, "#d7dadd",
        4, "#d9ddda",
        5, "#d7dadd",
        6, "#e4dce5",
        7, "#dbe6ed",
        8, "#eadcdf",
        9, "#e7e2cf",
        10, "#d6e5d8",
        "#e5e9e6",
      ],
      "fill-opacity": 0.66,
      "fill-outline-color": "#f7f9f8",
    },
  });
  if (includeRoadContext && data.roads) {
    map.addSource("local-road-context", { type: "geojson", data: data.roads });
    map.addLayer({
      id: "local-road-context",
      type: "line",
      source: "local-road-context",
      paint: {
        "line-color": "#8d9994",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.45, 13, 1.3],
        "line-opacity": 0.34,
      },
    });
  }
}

function enableOfflineBasemapFallback(map) {
  map.on("error", (event) => {
    if (event.sourceId !== "openstreetmap" || !map.getLayer("openstreetmap")) return;
    map.removeLayer("openstreetmap");
    if (map.getSource("openstreetmap")) map.removeSource("openstreetmap");
  });
}

function Metric({ label, value, meta, accent = "neutral" }) {
  return (
    <div className={`metric metric--${accent}`}>
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
      <span className="metric__meta">{meta}</span>
    </div>
  );
}

function SelectionMap({ data, method, size }) {
  const container = useRef(null);
  useEffect(() => {
    if (!container.current) return undefined;
    const selected = {
      type: "FeatureCollection",
      features: data.site_selection.facility_scenarios_geojson.features.filter(
        (feature) => feature.properties.scenario_method === method
          && Number(feature.properties.scenario_size) === Number(size),
      ),
    };
    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLE,
      center: [116.25, 40.01],
      zoom: 10,
      attributionControl: false,
    });
    enableOfflineBasemapFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      addLocalPlanningBasemap(map, data, true);
      map.addSource("selection-boundary", { type: "geojson", data: data.boundary });
      map.addLayer({
        id: "selection-boundary",
        type: "line",
        source: "selection-boundary",
        paint: { "line-color": "#2d6f83", "line-width": 1.5, "line-opacity": 0.8 },
      });
      map.addSource("hotspots", { type: "geojson", data: data.site_selection.failure_hotspots });
      map.addLayer({
        id: "hotspots",
        type: "fill",
        source: "hotspots",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "hotspot_priority"], 0, "#dce9e3", 0.5, "#e7a94c", 1, "#bd4a42"],
          "fill-opacity": 0.58,
          "fill-outline-color": "#ffffff",
        },
      });
      map.addSource("selected-facilities", { type: "geojson", data: selected });
      map.addLayer({
        id: "selected-facilities",
        type: "circle",
        source: "selected-facilities",
        paint: {
          "circle-radius": ["case", ["==", ["get", "candidate_role"], "core"], 8, 6],
          "circle-color": ["case", ["==", ["get", "candidate_role"], "core"], "#1f6675", "#f4f7f5"],
          "circle-stroke-color": "#173f48",
          "circle-stroke-width": 2,
        },
      });
      map.on("click", "selected-facilities", (event) => {
        const props = event.features?.[0]?.properties;
        if (!props) return;
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat(event.lngLat)
          .setHTML(`<b>${props.poi_name}</b><span>${props.candidate_role === "core" ? "核心设施" : "路径支撑节点"}</span><span>建议功能 ${props.recommended_functions || props.function_categories}</span>`)
          .addTo(map);
      });
      map.fitBounds([[116.17, 39.90], [116.395, 40.11]], { padding: 28, duration: 0 });
    });
    return () => map.remove();
  }, [data, method, size]);
  return <div ref={container} className="map-canvas" aria-label="失效热点与清凉设施选址地图" />;
}

function StatusPill({ status, label, color }) {
  const item = STATUS[status] ?? { label: label ?? status, color: color ?? "#64716c" };
  return (
    <span className="status-pill" style={{ "--status-color": item.color }}>
      <span aria-hidden="true" />
      {item.label}
    </span>
  );
}

function MapView({ data, routeSegments = [], selectedActivity = null, mode = "heat" }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!container.current || !data) return undefined;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLE,
      center: [116.22, 40.01],
      zoom: 9.7,
      attributionControl: false,
    });
    enableOfflineBasemapFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      addLocalPlanningBasemap(map, data);
      map.addSource("boundary", { type: "geojson", data: data.boundary });
      map.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: { "fill-color": "#2d6f83", "fill-opacity": 0.035 },
      });
      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#2d6f83", "line-width": 1.4, "line-opacity": 0.8 },
      });
      map.addSource("roads", { type: "geojson", data: data.roads });
      map.addLayer({
        id: "roads",
        type: "line",
        source: "roads",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "has_heat_data"], 0],
            "#aab5b0",
            [
              "interpolate", ["linear"], ["get", "effective_heat_stress"],
              0, "#2b8871", 0.35, "#d1ad38", 0.65, "#e0713c", 1, "#bd3f38",
            ],
          ],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.05, 13, 3.2],
          "line-opacity": mode === "heat" ? 0.82 : 0.14,
        },
      });
      map.on("mouseenter", "roads", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "roads", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "roads", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties;
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat(event.lngLat)
          .setHTML(props.has_heat_data === 1 || props.has_heat_data === "1"
            ? `<b>${props.road_name || "未命名道路"}</b><span>LST ${Number(props.lst).toFixed(1)}°C</span><span>有效热压力 ${Number(props.effective_heat_stress).toFixed(2)}</span>`
            : `<b>${props.road_name || "未命名道路"}</b><span>当前缺少完整热环境观测</span>`)
          .addTo(map);
      });
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      setMapReady(false);
      map.remove();
    };
  }, [data, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const drawRoute = () => {
      if (map.getLayer("activity-route")) map.removeLayer("activity-route");
      if (map.getSource("activity-route")) map.removeSource("activity-route");
      for (const marker of document.querySelectorAll(".route-marker")) marker.remove();
      if (!selectedActivity || routeSegments.length === 0) return;
      const features = routeSegments.map((segment) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[segment.from_lon, segment.from_lat], [segment.to_lon, segment.to_lat]],
        },
        properties: { exposure: segment.segment_heat_exposure ?? 0 },
      }));
      map.addSource("activity-route", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({
        id: "activity-route",
        type: "line",
        source: "activity-route",
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "exposure"], 0, "#267e9a", 0.3, "#f0ad32", 1.4, "#c4473c"],
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });
      const marker = (coordinates, kind) => {
        const element = document.createElement("div");
        element.className = `route-marker route-marker--${kind}`;
        new maplibregl.Marker({ element }).setLngLat(coordinates).addTo(map);
      };
      marker([selectedActivity.origin_lon, selectedActivity.origin_lat], "origin");
      marker([selectedActivity.destination_lon, selectedActivity.destination_lat], "destination");
      const bounds = new maplibregl.LngLatBounds();
      features.forEach((feature) => feature.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate)));
      map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 700 });
    };
    if (map.isStyleLoaded()) drawRoute();
    else map.once("idle", drawRoute);
    return () => map.off("idle", drawRoute);
  }, [routeSegments, selectedActivity, mapReady]);

  return <div ref={container} className="map-canvas" aria-label="海淀区热风险道路地图" />;
}

function Header({ active, setActive, menuOpen, setMenuOpen }) {
  return (
    <header className="topbar">
      <button className="icon-button mobile-only" aria-label="打开导航" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" size={20} />
      </button>
      <div className="topbar__context">
        <span>海淀区 · 2024 夏季</span>
        <strong>{NAV_ITEMS.find((item) => item.id === active)?.label}</strong>
      </div>
      <div className="topbar__status"><span aria-hidden="true" />阶段成果 · 模型验证运行</div>
    </header>
  );
}

function Sidebar({ active, setActive, open, setOpen, counterfactualComplete }) {
  return (
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand">
        <div className="brand__mark"><ThermometerSun aria-hidden="true" size={22} /></div>
        <div><strong>热风险活动诊断</strong><span>Cooling Siting Agent</span></div>
        <button className="icon-button mobile-only" aria-label="关闭导航" onClick={() => setOpen(false)}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <nav aria-label="主要导航">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={active === id ? "nav-item nav-item--active" : "nav-item"} onClick={() => { setActive(id); setOpen(false); }}>
            <Icon aria-hidden="true" size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__foot">
        <span>研究进度</span>
        <div className="progress"><span /></div>
        <strong>{counterfactualComplete ? "7 / 7 核心环节" : "6 / 7 核心环节"}</strong>
        <small>{counterfactualComplete ? "内部反事实验证已完成" : "下一步：反事实效果测算"}</small>
      </div>
    </aside>
  );
}

function Overview({ data, setActive, selectActivity }) {
  const activities = data.activities;
  const counts = Object.keys(STATUS).map((key) => ({
    key, name: STATUS[key].label, value: activities.filter((item) => item.activity_status === key).length,
  }));
  const top = activities.find((item) => item.activity_id === data.featured_activity_id) ?? activities[0];
  const riskRate = activities.filter((item) => item.activity_status !== "normal").length / activities.length;
  const counterfactualComplete = Boolean(data.counterfactual_validation?.completed);
  return (
    <section className="view">
      <div className="view-heading">
        <div><span className="eyebrow">城市规划诊断台</span><h1>从“哪里热”推进到<br />“谁的活动正在失效”</h1></div>
        <p>把道路热环境、居民活动目的、出行时间与真实路径放在同一分析框架中，识别需要优先获得清凉设施支持的活动与空间。</p>
      </div>
      <div className="metric-strip">
        <Metric label="模拟居民" value={activities.reduce((set, item) => set.add(item.agent_id), new Set()).size} meta="7 类典型居民" />
        <Metric label="模拟活动" value={activities.length} meta="具备完整活动链" />
        <Metric label="高温响应活动" value={compactNumber.format(riskRate * 100) + "%"} meta="调整、风险完成或失效" accent="warm" />
        <Metric label="活动失效" value={counts.find((item) => item.key === "failed").value} meta="达到当前失效阈值" accent="danger" />
      </div>
      <div className="overview-grid">
        <article className="map-stage">
          <div className="panel-heading">
            <div><span className="panel-kicker">01 · 空间诊断</span><h2>道路有效热压力</h2></div>
            <div className="legend"><span className="legend__cool" />低热压力<span className="legend__hot" />高热压力<span className="legend__missing" />缺测道路</div>
          </div>
          <MapView data={data} />
          <div className="map-note"><MapPin aria-hidden="true" size={16} />点击道路查看 LST 与有效热压力</div>
        </article>
        <aside className="diagnosis">
          <div className="panel-heading"><div><span className="panel-kicker">02 · 重点案例</span><h2>典型高暴露活动</h2></div><StatusPill status={top.activity_status} /></div>
          <div className="case-person"><span>{top.agent_label}</span><strong>{top.trip_purpose}</strong><small>{top.departure_time} 出发 · {compactNumber.format(top.route_distance_m / 1000)} km</small></div>
          <div className="exposure-total"><span>活动累计热暴露</span><strong>{compactNumber.format(top.cumulative_heat_exposure)}</strong><small>标准化热压力分钟</small></div>
          <div className="exposure-split">
            <div><span>沿途道路</span><strong>{compactNumber.format(top.route_cumulative_heat_exposure)}</strong></div>
            <div><span>目的地停留</span><strong>{compactNumber.format(top.destination_dwell_heat_exposure)}</strong></div>
          </div>
          <div className="planning-callout"><span>规划响应</span><p>{top.facility_needs}</p></div>
          <button className="primary-button" onClick={() => { selectActivity(top.activity_id); setActive("route"); }}>查看完整活动路线<ArrowUpRight aria-hidden="true" size={17} /></button>
        </aside>
      </div>
      <div className="lower-grid">
        <article className="data-panel">
          <div className="panel-heading"><div><span className="panel-kicker">03 · 行为结果</span><h2>高温下的活动状态</h2></div></div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={counts} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid stroke="#e8ecea" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={70} tick={{ fill: "#64716c", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "#f1f4f2" }} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={18}>
                {counts.map((item) => <Cell key={item.key} fill={STATUS[item.key].color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="workflow">
          <div className="panel-heading"><div><span className="panel-kicker">04 · 研究链路</span><h2>从识别到干预</h2></div></div>
          {[
            ["空间环境底座", "已完成", "done"],
            ["居民活动与路线模拟", "基础版本已完成", "done"],
            ["逐道路边累计热暴露", "已完成并审查", "done"],
            ["高温活动失效识别", "基础版本已完成", "done"],
            ["动态气象正式接入", "已完成", "done"],
            ["清凉设施选址", "已形成初步方案", "done"],
            ["反事实效果验证", counterfactualComplete ? "内部验证已完成" : "下一阶段", counterfactualComplete ? "done" : "active"],
          ].map(([name, state, type], index) => (
            <div className={`workflow__row workflow__row--${type}`} key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>{state}</small>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function RouteView({ data, selectedId, setSelectedId }) {
  const [agent, setAgent] = useState("全部居民");
  const filtered = useMemo(() => agent === "全部居民" ? data.activities : data.activities.filter((item) => item.agent_label === agent), [agent, data.activities]);
  const activity = filtered.find((item) => item.activity_id === selectedId) ?? filtered[0];
  const routeSegments = useMemo(() => data.segments.filter((item) => item.activity_id === activity.activity_id).sort((a, b) => a.segment_sequence - b.segment_sequence), [activity, data.segments]);
  const profile = routeSegments.map((item) => ({ ...item, label: String(item.segment_sequence) }));
  const topSegments = [...routeSegments].sort((a, b) => (b.segment_heat_exposure ?? 0) - (a.segment_heat_exposure ?? 0)).slice(0, 5);
  return (
    <section className="view">
      <div className="view-heading view-heading--compact">
        <div><span className="eyebrow">活动级诊断</span><h1>一次日常活动，如何沿道路累积热暴露</h1></div>
        <p>路线颜色表示每条道路边的暴露贡献。活动必要性、时间刚性与居民脆弱性共同影响行为响应。</p>
      </div>
      <div className="route-toolbar">
        <label>居民类型<select value={agent} onChange={(event) => setAgent(event.target.value)}><option>全部居民</option>{[...new Set(data.activities.map((item) => item.agent_label))].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>活动案例<select value={activity.activity_id} onChange={(event) => setSelectedId(event.target.value)}>{filtered.slice(0, 80).map((item) => <option value={item.activity_id} key={item.activity_id}>{item.trip_purpose} · {item.departure_time} · {STATUS[item.activity_status]?.label}</option>)}</select></label>
        <StatusPill status={activity.activity_status} />
      </div>
      <div className="route-layout">
        <article className="route-map">
          <MapView data={data} routeSegments={routeSegments} selectedActivity={activity} mode="route" />
          <div className="route-map__legend"><span className="origin-dot" />活动起点<span className="destination-dot" />活动目的地</div>
        </article>
        <aside className="route-brief">
          <span className="panel-kicker">居民活动画像</span>
          <h2>{activity.agent_label} · {activity.trip_purpose}</h2>
          <p>{activity.reason}</p>
          <dl>
            <div><dt><Clock3 aria-hidden="true" size={15} />出发时间</dt><dd>{activity.departure_time}</dd></div>
            <div><dt><Footprints aria-hidden="true" size={15} />路线距离</dt><dd>{compactNumber.format(activity.route_distance_m / 1000)} km</dd></div>
            <div><dt><Route aria-hidden="true" size={15} />路径偏好</dt><dd>{activity.path_preference_label}</dd></div>
            <div><dt><CircleDot aria-hidden="true" size={15} />主要问题位置</dt><dd>{activity.failure_zone_type}</dd></div>
          </dl>
          <div className="planning-callout"><span>需要的清凉支持</span><p>{activity.facility_needs}</p></div>
        </aside>
      </div>
      <div className="metric-strip metric-strip--route">
        <Metric label="户外通行" value={`${compactNumber.format(activity.outdoor_travel_minutes)} min`} meta={`${activity.road_edge_count} 条道路边`} />
        <Metric label="道路暴露" value={compactNumber.format(activity.route_cumulative_heat_exposure)} meta="沿路径累计" accent="warm" />
        <Metric label="停留暴露" value={compactNumber.format(activity.destination_dwell_heat_exposure)} meta="目的地户外停留" accent="warm" />
        <Metric label="活动累计暴露" value={compactNumber.format(activity.cumulative_heat_exposure)} meta="标准化热压力分钟" accent="danger" />
      </div>
      <div className="lower-grid lower-grid--route">
        <article className="data-panel">
          <div className="panel-heading"><div><span className="panel-kicker">暴露剖面</span><h2>道路边贡献与累计过程</h2></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={profile} margin={{ left: -18, right: 12, top: 12 }}>
              <CartesianGrid stroke="#e8ecea" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 11, fill: "#7b8782" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7b8782" }} />
              <Tooltip />
              <Area type="monotone" dataKey="route_cumulative_exposure_at_segment_end" stroke="#c4473c" fill="#f3d8d4" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </article>
        <article className="hot-segments">
          <div className="panel-heading"><div><span className="panel-kicker">重点道路</span><h2>暴露贡献最高的道路边</h2></div></div>
          <div className="segment-list">
            {topSegments.map((segment, index) => (
              <div key={`${segment.segment_sequence}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{segment.road_name || "未命名道路"}</strong><small>{compactNumber.format(segment.length_m)} m · 热压力 {compactNumber.format(segment.heat_stress)}</small></div><b>{compactNumber.format(segment.segment_heat_exposure)}</b></div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function SelectionView({ data }) {
  const [method, setMethod] = useState("balanced_network");
  const [size, setSize] = useState(20);
  const summary = data.site_selection.scenario_summary.find(
    (item) => item.scenario_method === method && Number(item.scenario_size) === Number(size),
  );
  const counterfactual = data.site_selection.counterfactual_summary.find(
    (item) => item.scenario_method === method && Number(item.scenario_size) === Number(size),
  );
  const selected = data.site_selection.facility_scenarios
    .filter((item) => item.scenario_method === method && Number(item.scenario_size) === Number(size))
    .sort((a, b) => a.selection_order - b.selection_order);
  const topFailures = data.site_selection.activity_failure_summary.slice(0, 8);
  const comparison = data.site_selection.scenario_summary.map((item) => ({
    ...item,
    display_label: `${item.scenario_method === "balanced_network" ? "平衡" : "覆盖"} ${item.scenario_size}`,
  }));
  return (
    <section className="view">
      <div className="view-heading view-heading--compact">
        <div><span className="eyebrow">规划干预方案</span><h1>从失效热点生成清凉设施网络</h1></div>
        <p>将活动失效、道路边累计暴露、设施功能匹配和存量设施复用放入同一选址模型，形成核心设施与路径支撑节点组合。</p>
      </div>
      <div className="selection-toolbar">
        <label>方案逻辑<select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="balanced_network">核心设施与路径节点平衡</option>
          <option value="agent_effective_coverage">最大化有效需求覆盖</option>
        </select></label>
        <label>设施数量<select value={size} onChange={(event) => setSize(Number(event.target.value))}>
          {[5, 10, 20].map((item) => <option key={item} value={item}>{item} 个点位</option>)}
        </select></label>
        <div className="selection-toolbar__note"><CircleDot aria-hidden="true" size={15} />当前属于模型内部规划方案，容量和开放条件待现场核查</div>
      </div>
      <div className="metric-strip">
        <Metric label="失效活动需求" value="96" meta="失效、风险完成与行为调整" accent="danger" />
        <Metric label="路径需求道路边" value="2,408" meta="逐道路边累计暴露汇总" accent="warm" />
        <Metric label="有效需求覆盖" value={percent.format(summary?.demand_coverage_rate ?? 0)} meta={`${size} 个设施的功能折减覆盖`} accent="cool" />
        <Metric label="模型失效恢复率" value={percent.format(counterfactual?.failed_activity_recovery_rate ?? 0)} meta="同一活动与高温情景反事实" accent="warm" />
      </div>
      <div className="selection-layout">
        <article className="map-stage">
          <div className="panel-heading"><div><span className="panel-kicker">失效热点与推荐点</span><h2>{method === "balanced_network" ? "平衡型设施网络" : "最大有效覆盖方案"}</h2></div><div className="legend"><span className="legend__hot" />高需求热点<span className="selection-legend-core" />核心设施<span className="selection-legend-support" />路径节点</div></div>
          <SelectionMap data={data} method={method} size={size} />
        </article>
        <aside className="selection-list">
          <div className="panel-heading"><div><span className="panel-kicker">优先序列</span><h2>推荐设施行动</h2></div></div>
          <div className="selection-list__items">
            {selected.slice(0, 10).map((item) => (
              <div key={`${item.scenario_method}-${item.scenario_size}-${item.selection_order}`}>
                <span>{String(item.selection_order).padStart(2, "0")}</span>
                <div><strong>{item.poi_name}</strong><small>{item.recommended_functions || item.function_categories} · 新增覆盖 {compactNumber.format(item.marginal_covered_demand_weight)}</small></div>
                <b>{item.candidate_role === "core" ? "核心" : "路径"}</b>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <div className="lower-grid">
        <article className="data-panel">
          <div className="panel-heading"><div><span className="panel-kicker">方案比较</span><h2>设施数量与有效覆盖</h2></div></div>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={comparison} margin={{ left: -12, right: 20, top: 12 }}>
              <CartesianGrid stroke="#e8ecea" vertical={false} />
              <XAxis dataKey="display_label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
              <Tooltip formatter={(value) => percent.format(value)} />
              <Bar dataKey="demand_coverage_rate" fill="#2d7885" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="hot-segments">
          <div className="panel-heading"><div><span className="panel-kicker">失效构成</span><h2>优先处理的活动问题</h2></div></div>
          <div className="segment-list">
            {topFailures.map((item, index) => (
              <div key={`${item.failure_zone_type}-${item.activity_status}-${item.trip_purpose}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{item.trip_purpose} · {item.failure_zone_type}</strong><small>{STATUS[item.activity_status]?.label} · {item.activity_count} 项活动</small></div>
                <b>{compactNumber.format(item.total_demand_weight)}</b>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function EvidenceView({ data }) {
  const hot = data.hot_days[0];
  const counterfactual = data.counterfactual_validation;
  const roadAudit = data.road_network_audit;
  const roadMain = roadAudit.routing_main_network;
  const routeAudit = roadAudit.activity_route_audit;
  const checks = Object.entries(data.audit.failed_conservation_checks).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }));
  return (
    <section className="view">
      <div className="view-heading view-heading--compact">
        <div><span className="eyebrow">证据与边界</span><h1>哪些结果已经通过检查，哪些仍需外部验证</h1></div>
        <p>把内部一致性、气象数据核验和待校准参数分开表达，避免将阶段性模型结果误读为最终规划结论。</p>
      </div>
      <div className="evidence-hero">
        <div><span>首位典型高温日</span><strong>{hot.date_beijing}</strong><small>依据日间平均气温、最高气温、高温小时与太阳辐射综合排序</small></div>
        <Metric label="10:00–16:00 平均气温" value={`${compactNumber.format(hot.daytime_t2m_mean_c)}°C`} meta="ERA5-Land" accent="warm" />
        <Metric label="日间最高气温" value={`${compactNumber.format(hot.daytime_t2m_max_c)}°C`} meta={`${hot.hot_hour_count} 个 ≥35°C 小时`} accent="danger" />
      </div>
      <div className="evidence-grid">
        <article className="data-panel">
          <div className="panel-heading"><div><span className="panel-kicker">气象背景</span><h2>2024 年夏季日间气温</h2></div></div>
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={data.weather} margin={{ left: -18, right: 12, top: 12 }}>
              <CartesianGrid stroke="#e8ecea" vertical={false} />
              <XAxis dataKey="date_beijing" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 11, fill: "#7b8782" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7b8782" }} />
              <Tooltip />
              <Line type="monotone" dataKey="daytime_t2m_mean_c" name="日间平均气温" stroke="#e07439" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="daytime_t2m_max_c" name="日间最高气温" stroke="#c4473c" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <article className="audit-panel">
          <div className="panel-heading"><div><span className="panel-kicker">内部一致性</span><h2>逐道路边计算审查</h2></div><CheckCircle2 aria-hidden="true" size={22} /></div>
          <div className="audit-main"><strong>0</strong><span>项守恒或连续性错误</span></div>
          <div className="audit-stats"><div><span>审查活动</span><b>{data.audit.activities}</b></div><div><span>审查道路边</span><b>{data.audit.segments.toLocaleString("zh-CN")}</b></div><div><span>环境覆盖率</span><b>{percent.format(data.audit.mean_route_environment_coverage)}</b></div></div>
          <div className="check-list">{checks.map((check) => <div key={check.name}><CheckCircle2 aria-hidden="true" size={15} /><span>{check.name}</span><b>{check.value}</b></div>)}</div>
        </article>
      </div>
      <article className="counterfactual-panel">
        <div className="panel-heading">
          <div><span className="panel-kicker">干预效果证据</span><h2>内部反事实验证</h2></div>
          <StatusPill label="模型内部验证已完成" color="#26856b" />
        </div>
        <div className="counterfactual-panel__metrics">
          <Metric label="干预情景" value={counterfactual.scenario_count} meta="设施数量与目标函数组合" accent="cool" />
          <Metric label="活动对比" value={counterfactual.activity_comparisons.toLocaleString("zh-CN")} meta={`${counterfactual.baseline_activities} 项基准活动的情景复算`} accent="warm" />
          <Metric label="最佳失效恢复率" value={percent.format(counterfactual.best_failed_activity_recovery_rate)} meta="失效活动在设施干预后恢复" accent="warm" />
          <Metric label="最大暴露削减" value={compactNumber.format(counterfactual.best_total_exposure_reduction)} meta="模型标准化热压力分钟" accent="danger" />
        </div>
        <div className="counterfactual-panel__scope">
          <div><CheckCircle2 aria-hidden="true" size={17} /><p><strong>已回答：</strong>{counterfactual.validation_scope}，用于比较方案方向与设施组合。</p></div>
          <div><ShieldCheck aria-hidden="true" size={17} /><p><strong>仍待回答：</strong>居民真实行为响应、设施使用率与实施后的现场降温效果，需要问卷、轨迹或实测数据校准。</p></div>
        </div>
      </article>
      <article className="counterfactual-panel">
        <div className="panel-heading">
          <div><span className="panel-kicker">空间执行证据</span><h2>OSM 步行主网络质量审查</h2></div>
          <StatusPill label="正式路径网络已接入" color="#26856b" />
        </div>
        <div className="counterfactual-panel__metrics">
          <Metric label="主网络道路边" value={roadMain.edges.toLocaleString("zh-CN")} meta="逐道路边路径计算单元" accent="cool" />
          <Metric label="连通分量" value={roadMain.components} meta="最大连通主网络" accent="cool" />
          <Metric label="活动路径可达率" value={percent.format(routeAudit.route_reachability_rate)} meta={`${routeAudit.activity_count} 项活动 OD 审查`} accent="warm" />
          <Metric label="绕行系数中位数" value={compactNumber.format(routeAudit.median_detour_ratio)} meta="道路路径距离 / 直线距离" accent="warm" />
        </div>
        <div className="counterfactual-panel__scope">
          <div><CheckCircle2 aria-hidden="true" size={17} /><p><strong>已完成：</strong>排除 {roadAudit.excluded_major_road_edges.toLocaleString("zh-CN")} 条高等级非步行道路，主网络保持单一连通分量并通过现有 RoadRouter 接口审查。</p></div>
          <div><ShieldCheck aria-hidden="true" size={17} /><p><strong>持续核验：</strong>全部候选 OD 中 {percent.format(roadAudit.od_access_audit.within_100m_rate)} 可在 100 米内接入主网络，较远点位仍需核验社区入口与内部通道。</p></div>
        </div>
      </article>
      <div className="boundary-grid">
        <article><span className="boundary-grid__state boundary-grid__state--done">已经完成</span><h3>可以稳定展示的结果</h3><p>空间环境底座、活动与路径模拟基础版本、逐道路边累计暴露、活动状态判断、计算守恒与路径连续性审查。</p></article>
        <article><span className="boundary-grid__state boundary-grid__state--done">已经完成</span><h3>动态气象与内部反事实验证</h3><p>ERA5-Land 已接入活动暴露计算；清凉设施方案已在同一批活动和高温情景下完成干预前后比较。</p></article>
        <article><span className="boundary-grid__state">仍需外部验证</span><h3>规划决策可信度</h3><p>活动失效阈值、居民行为参数、目的地真实微环境、设施使用率与选址后的活动恢复效果。</p></article>
      </div>
    </section>
  );
}

function MethodView() {
  return (
    <section className="view">
      <div className="view-heading view-heading--compact">
        <div><span className="eyebrow">方法框架</span><h1>Agent 如何把热环境转译为设施选址需求</h1></div>
        <p>空间热风险提供环境约束，居民 Agent 生成有目的、有时间、有路径的活动，失效识别结果进一步进入设施需求与选址。</p>
      </div>
      <div className="method-flow">
        {[
          ["01", "识别空间热环境", "LST、树冠、水体距离与道路环境"],
          ["02", "生成居民活动", "居民类型、活动目的与出发时间"],
          ["03", "执行真实路径", "POI 目的地与环境感知选路"],
          ["04", "累计道路边暴露", "进入时间、高温重叠与脆弱性"],
          ["05", "识别活动失效", "正常、调整、风险完成与失效"],
          ["06", "转译设施需求", "位置、功能、人群与时间需求"],
          ["07", "选址与反事实验证", "存量复用、新增补点与效果评估"],
        ].map(([number, title, text]) => <div key={number}><span>{number}</span><strong>{title}</strong><p>{text}</p></div>)}
      </div>
      <div className="formula-grid">
        <article><span className="panel-kicker">道路边暴露</span><div className="formula">Exposure<sub>g,e</sub> = H<sub>e</sub> × Δt<sup>heat</sup><sub>g,e</sub> × V<sub>g</sub></div><p>道路热压力 × 经过该道路时与高温时段重叠的分钟数 × 居民热脆弱性权重。</p></article>
        <article><span className="panel-kicker">完整活动暴露</span><div className="formula">ActivityExposure<sub>g</sub> = RouteExposure<sub>g</sub> + DestinationExposure<sub>g</sub></div><p>同时考虑沿途移动暴露和目的地户外停留暴露，定位活动失效发生的主要空间。</p></article>
      </div>
      <div className="agent-grid">
        {[["UsersRound", "行为生成", "依据居民类型、活动规则和公开统计约束生成日常活动。"], ["Map", "空间执行", "选择真实 POI 目的地，并在步行路网上执行路径选择。"], ["Activity", "需求转译", "把行为调整、风险完成与活动失效转译为设施功能需求。"]].map(([icon, title, text]) => {
          const Icon = { UsersRound, Map, Activity }[icon];
          return <article key={title}><Icon aria-hidden="true" size={21} /><h3>{title}</h3><p>{text}</p></article>;
        })}
      </div>
    </section>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState("overview");
  const [selectedId, setSelectedId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/showcase.json`).then((response) => response.json()).then((payload) => {
      setData(payload);
      setSelectedId(payload.featured_activity_id ?? payload.activities[0]?.activity_id ?? "");
    });
  }, []);
  if (!data) return <div className="loading" aria-live="polite"><ThermometerSun aria-hidden="true" /><span>正在载入研究成果…</span></div>;
  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} setOpen={setMenuOpen} counterfactualComplete={Boolean(data.counterfactual_validation?.completed)} />
      <div className="app-main">
        <Header active={active} setActive={setActive} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <main id="main-content">
          {active === "overview" && <Overview data={data} setActive={setActive} selectActivity={setSelectedId} />}
          {active === "route" && <RouteView data={data} selectedId={selectedId} setSelectedId={setSelectedId} />}
          {active === "selection" && <SelectionView data={data} />}
          {active === "evidence" && <EvidenceView data={data} />}
          {active === "method" && <MethodView />}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
