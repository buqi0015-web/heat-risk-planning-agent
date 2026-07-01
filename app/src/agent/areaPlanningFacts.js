const DEFAULT_RADIUS_METERS = 1000;

export const areaIndex = {
  五道口: {
    areaName: "五道口",
    aliases: ["五道口", "五道口附近", "五道口片区"],
    center: [116.337, 39.992],
    radiusMeters: 1200,
    relatedRoads: ["成府路", "清华东路", "学院路", "中关村东路"],
    relatedKeywords: ["五道口", "清华东路", "成府路", "学院路", "中关村东路"],
  },
  清华东路: {
    areaName: "清华东路",
    aliases: ["清华东路", "清华东路附近"],
    center: [116.345, 40.005],
    radiusMeters: 1000,
    relatedRoads: ["清华东路", "学院路", "双清路"],
    relatedKeywords: ["清华东路", "学院路", "双清路"],
  },
  海淀黄庄: {
    areaName: "海淀黄庄",
    aliases: ["海淀黄庄", "黄庄", "海淀黄庄附近"],
    center: [116.317, 39.976],
    radiusMeters: 1000,
    relatedRoads: ["中关村大街", "知春路", "海淀南路"],
    relatedKeywords: ["海淀黄庄", "黄庄", "中关村大街", "知春路"],
  },
  远大路: {
    areaName: "远大路",
    aliases: ["远大路", "远大路附近"],
    center: [116.282, 39.955],
    radiusMeters: 1200,
    relatedRoads: ["远大路", "远大中路", "蓝靛厂南路"],
    relatedKeywords: ["远大路", "远大中路", "蓝靛厂南路"],
  },
  知春路: {
    areaName: "知春路",
    aliases: ["知春路", "知春路附近"],
    center: [116.333, 39.977],
    radiusMeters: 1200,
    relatedRoads: ["知春路", "中关村东路", "学院路"],
    relatedKeywords: ["知春路", "中关村东路", "学院路"],
  },
};

export const landmarkIndex = {
  北京林业大学: {
    landmarkName: "北京林业大学",
    aliases: ["北京林业大学", "北林", "林业大学", "北京林大"],
    center: [116.345, 40.002],
    radiusMeters: 1100,
    relatedRoads: ["清华东路", "学院路", "双清路", "成府路"],
    relatedKeywords: ["北京林业大学", "北林", "林业大学", "清华东路", "学院路", "双清路", "成府路"],
  },
  中国农业大学东校区: {
    landmarkName: "中国农业大学东校区",
    aliases: ["中国农业大学东校区", "农大东校区", "中国农大东校区", "农业大学东校区"],
    center: [116.358, 40.006],
    radiusMeters: 1100,
    relatedRoads: ["清华东路", "学院路", "双清路"],
    relatedKeywords: ["中国农业大学东校区", "农大东校区", "清华东路", "学院路", "双清路"],
  },
  北京科技大学: {
    landmarkName: "北京科技大学",
    aliases: ["北京科技大学", "北科大", "北京科大"],
    center: [116.359, 39.991],
    radiusMeters: 1100,
    relatedRoads: ["学院路", "成府路", "北四环中路"],
    relatedKeywords: ["北京科技大学", "北科大", "学院路", "成府路", "北四环中路"],
  },
  北京语言大学: {
    landmarkName: "北京语言大学",
    aliases: ["北京语言大学", "北语"],
    center: [116.339, 39.994],
    radiusMeters: 1000,
    relatedRoads: ["学院路", "成府路", "清华东路"],
    relatedKeywords: ["北京语言大学", "北语", "学院路", "成府路", "清华东路"],
  },
  清华大学: {
    landmarkName: "清华大学",
    aliases: ["清华大学", "清华"],
    center: [116.326, 40.003],
    radiusMeters: 1400,
    relatedRoads: ["清华路", "中关村东路", "成府路", "清华东路"],
    relatedKeywords: ["清华大学", "清华", "清华路", "中关村东路", "成府路", "清华东路"],
  },
  北京大学: {
    landmarkName: "北京大学",
    aliases: ["北京大学", "北大"],
    center: [116.310, 39.992],
    radiusMeters: 1400,
    relatedRoads: ["颐和园路", "中关村北大街", "成府路", "海淀路"],
    relatedKeywords: ["北京大学", "北大", "颐和园路", "中关村北大街", "成府路", "海淀路"],
  },
  北京航空航天大学: {
    landmarkName: "北京航空航天大学",
    aliases: ["北京航空航天大学", "北航", "北航学院路校区"],
    center: [116.347, 39.981],
    radiusMeters: 1200,
    relatedRoads: ["学院路", "知春路", "北四环中路"],
    relatedKeywords: ["北京航空航天大学", "北航", "学院路", "知春路", "北四环中路"],
  },
};

const STOP_TERMS = [
  "附近", "周边", "有没有", "是否", "存在", "哪些", "哪里", "那里", "这里", "怎么", "如何", "治理",
  "候选点", "候选设施", "设施点", "清凉设施", "热风险", "风险等级", "设施缺口", "缺口", "覆盖",
  "方案", "推荐", "优先", "分析", "多少", "什么", "之外", "除了",
];

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

export function detectArea(input) {
  const text = normalizeText(input);
  return Object.values(areaIndex).find((area) => area.aliases.some((alias) => text.includes(alias))) ?? null;
}

export function detectLandmark(input) {
  const text = normalizeText(input);
  return Object.values(landmarkIndex).find((landmark) => landmark.aliases.some((alias) => text.includes(alias))) ?? null;
}

export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function flattenCoordinates(coordinates, acc = []) {
  if (!Array.isArray(coordinates)) return acc;
  if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    acc.push([Number(coordinates[0]), Number(coordinates[1])]);
    return acc;
  }
  coordinates.forEach((item) => flattenCoordinates(item, acc));
  return acc;
}

export function geometryCenter(geometry) {
  if (!geometry) return null;
  const points = flattenCoordinates(geometry.coordinates);
  if (!points.length) return null;
  const [lon, lat] = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [lon / points.length, lat / points.length];
}

export function roadRiskLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "无热风险数据";
  if (number >= 0.75) return "极高";
  if (number >= 0.6) return "高";
  if (number >= 0.45) return "中高";
  if (number >= 0.3) return "中";
  return "低";
}

function getCoordinate(item) {
  if (Array.isArray(item?.coordinates)) return item.coordinates;
  if (Number.isFinite(Number(item?.coordinates?.lon)) && Number.isFinite(Number(item?.coordinates?.lat))) {
    return [Number(item.coordinates.lon), Number(item.coordinates.lat)];
  }
  if (Number.isFinite(Number(item?.lon)) && Number.isFinite(Number(item?.lat))) return [Number(item.lon), Number(item.lat)];
  if (Number.isFinite(Number(item?.longitude)) && Number.isFinite(Number(item?.latitude))) {
    return [Number(item.longitude), Number(item.latitude)];
  }
  if (Number.isFinite(Number(item?.location?.lon)) && Number.isFinite(Number(item?.location?.lat))) {
    return [Number(item.location.lon), Number(item.location.lat)];
  }
  return null;
}

function getName(item) {
  return String(
    item?.locationName
    ?? item?.poi_name
    ?? item?.name
    ?? item?.roadName
    ?? item?.road_name
    ?? item?.origin_name
    ?? item?.destination_name
    ?? "",
  );
}

function distanceToPoint(center, coordinate) {
  return Math.round(haversineMeters(center, coordinate));
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function extractQueryTerms(input) {
  const text = normalizeText(input);
  const terms = text.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,}/g) ?? [];
  return Array.from(new Set(terms
    .flatMap((term) => {
      let cleaned = term;
      STOP_TERMS.forEach((stop) => {
        cleaned = cleaned.replaceAll(stop, " ");
      });
      return cleaned.split(/\s+/);
    })
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_TERMS.includes(term))))
    .slice(0, 12);
}

function roadFeatures(showcaseData) {
  return showcaseData?.roads?.features ?? [];
}

function hotspotFeatures(showcaseData) {
  return showcaseData?.site_selection?.failure_hotspots?.features ?? [];
}

function scenarioFacilityFeatures(showcaseData) {
  return showcaseData?.site_selection?.facility_scenarios_geojson?.features ?? [];
}

function activityRecords(showcaseData) {
  return showcaseData?.activities ?? [];
}

function priorityEdgeRecords(showcaseData) {
  return showcaseData?.site_selection?.priority_edges ?? [];
}

function makeRoadRecord(feature, center = null) {
  const props = feature.properties ?? {};
  const coordinate = geometryCenter(feature.geometry);
  const heatStress = props.effective_heat_stress ?? props.heat_stress ?? null;
  return {
    roadName: props.road_name,
    roadType: props.fclass_cn ?? null,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
    heatStress,
    riskLevel: roadRiskLevel(heatStress),
    hasHeatData: Boolean(props.has_heat_data),
    treeCanopyCover: props.tree_canopy_cover ?? null,
    distanceToWaterMeters: props.distance_to_water_m ?? null,
  };
}

function makeScenarioFacilityRecord(feature, center = null) {
  const props = feature.properties ?? {};
  const coordinate = geometryCenter(feature.geometry) ?? getCoordinate(props);
  return {
    siteId: props.candidate_id,
    locationName: props.poi_name,
    facilityType: props.recommended_functions ?? props.function_categories,
    candidateRole: props.candidate_role,
    priority: props.rank,
    score: Number.isFinite(Number(props.candidate_score)) ? Math.round(Number(props.candidate_score) * 1000) / 10 : null,
    coveredDemandWeight: props.covered_demand_weight ?? null,
    dominantNeeds: props.dominant_needs ?? null,
    reuseFunctions: props.reuse_functions ?? null,
    publicness: props.publicness ?? null,
    feasibility: props.operational_readiness ?? null,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
  };
}

function makeCandidateRecord(site, center = null) {
  const coordinate = getCoordinate(site);
  return {
    siteId: site.siteId ?? site.candidate_id ?? site.id,
    locationName: site.locationName ?? site.poi_name ?? site.name,
    facilityType: site.facilityType ?? site.recommended_functions ?? site.type,
    priority: site.priority ?? site.rank,
    score: site.score ?? site.candidate_score,
    coveredPopulation: site.coveredPopulation,
    walkDistanceImprovement: site.walkDistanceImprovement,
    riskLevel: site.riskLevel,
    feasibility: site.feasibility,
    evidence: site.evidence,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
  };
}

function makeFacilityRecord(facility, center = null) {
  const coordinate = getCoordinate(facility);
  return {
    id: facility.id,
    name: facility.locationName ?? facility.name ?? facility.poi_name,
    type: facility.type ?? facility.facilityType ?? facility.poi_type,
    readiness: facility.readiness,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
  };
}

function makeIndexedPlaceRecord(place, center = null) {
  const coordinate = Number.isFinite(Number(place?.lon)) && Number.isFinite(Number(place?.lat))
    ? [Number(place.lon), Number(place.lat)]
    : getCoordinate(place);
  return {
    id: place.id,
    name: place.name,
    aliases: place.aliases ?? [],
    type: place.poiType,
    mainCategory: place.mainCategory,
    midCategory: place.midCategory,
    subCategory: place.subCategory,
    address: place.address,
    poiGroups: place.poiGroups,
    reuseFunctions: place.reuseFunctions,
    publicness: place.publicness,
    conflictRisk: place.conflictRisk,
    isCoolingCandidate: Boolean(place.isCoolingCandidate),
    isCoreCoolingCandidate: Boolean(place.isCoreCoolingCandidate),
    isSupportCoolingCandidate: Boolean(place.isSupportCoolingCandidate),
    source: place.source,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
  };
}

function makeHotspotRecord(feature, center = null) {
  const props = feature.properties ?? {};
  const coordinate = geometryCenter(feature.geometry);
  return {
    hotspotId: props.hotspot_id,
    coordinate,
    distanceMeters: center && coordinate ? distanceToPoint(center, coordinate) : null,
    demandRecordCount: props.demand_record_count ?? null,
    demandWeight: props.total_demand_weight ?? null,
    dominantNeeds: props.dominant_needs ?? null,
    failureZone: props.dominant_failure_zone ?? null,
    priority: props.hotspot_priority ?? null,
  };
}

function makeActivityRecord(activity, center = null) {
  const origin = [Number(activity.origin_lon), Number(activity.origin_lat)];
  const destination = [Number(activity.destination_lon), Number(activity.destination_lat)];
  const originValid = Number.isFinite(origin[0]) && Number.isFinite(origin[1]);
  const destinationValid = Number.isFinite(destination[0]) && Number.isFinite(destination[1]);
  const distance = Math.min(
    center && originValid ? haversineMeters(center, origin) : Infinity,
    center && destinationValid ? haversineMeters(center, destination) : Infinity,
  );
  return {
    activityId: activity.activity_id,
    agentLabel: activity.agent_label,
    tripPurpose: activity.trip_purpose,
    originName: activity.origin_name,
    destinationName: activity.destination_name,
    status: activity.activity_status,
    failureZoneType: activity.failure_zone_type,
    cumulativeHeatExposure: activity.cumulative_heat_exposure,
    facilityNeeds: activity.facility_needs,
    reason: activity.reason,
    distanceMeters: Math.round(distance),
  };
}

function matchByTerms(name, terms) {
  if (!name || !terms.length) return false;
  return terms.some((term) => name.includes(term) || term.includes(name));
}

function matchIndexedPlace(place, terms) {
  const haystack = [
    place.name,
    ...(place.aliases ?? []),
    place.address,
    place.mainCategory,
    place.midCategory,
    place.subCategory,
  ].filter(Boolean).join("");
  return matchByTerms(haystack, terms);
}

function scoreIndexedPlace(place, terms) {
  const name = String(place.name ?? "");
  const aliases = place.aliases ?? [];
  let score = 0;
  for (const term of terms) {
    if (name === term || aliases.includes(term)) score += 100;
    else if (name.includes(term)) score += 60 + Math.min(term.length, 12);
    else if (term.includes(name)) score += 40 + Math.min(name.length, 12);
    else if (String(place.address ?? "").includes(term)) score += 12;
  }
  if (place.isCoolingCandidate) score += 8;
  if (place.isCoreCoolingCandidate) score += 6;
  return score;
}

function isRoadLikeQuery(input, terms) {
  const text = normalizeText(input);
  return /热风险|风险等级|道路|路段|沿线/.test(text)
    || terms.some((term) => /路|街|巷|桥|道|大街|高速|胡同/.test(term));
}

function buildMatchedEntities({ input, showcaseData, candidateSites, existingFacilities, placeIndex }) {
  const area = detectArea(input);
  const terms = extractQueryTerms(input);
  const indexedPlaces = (placeIndex?.places ?? [])
    .filter((place) => matchIndexedPlace(place, terms))
    .map((place) => ({ ...makeIndexedPlaceRecord(place), matchScore: scoreIndexedPlace(place, terms) }))
    .sort((a, b) => Number(b.matchScore ?? 0) - Number(a.matchScore ?? 0))
    .slice(0, 30);

  const roads = roadFeatures(showcaseData)
    .map((feature) => makeRoadRecord(feature))
    .filter((road) => road.roadName && road.roadName !== "（非成熟路线）" && matchByTerms(road.roadName, terms));

  const scenarioFacilities = scenarioFacilityFeatures(showcaseData)
    .map((feature) => makeScenarioFacilityRecord(feature))
    .filter((site) => matchByTerms(site.locationName, terms));

  const candidates = candidateSites
    .map((site) => makeCandidateRecord(site))
    .filter((site) => matchByTerms(site.locationName, terms));

  const facilities = existingFacilities
    .map((facility) => makeFacilityRecord(facility))
    .filter((facility) => matchByTerms(facility.name, terms));

  const activities = activityRecords(showcaseData)
    .map((activity) => ({
      ...activity,
      matchName: `${activity.origin_name ?? ""}${activity.destination_name ?? ""}${activity.trip_purpose ?? ""}`,
    }))
    .filter((activity) => matchByTerms(activity.matchName, terms))
    .slice(0, 12);

  return {
    area,
    terms,
    roads: uniqBy(roads, (road) => road.roadName).slice(0, 20),
    scenarioFacilities: uniqBy(scenarioFacilities, (site) => site.siteId ?? site.locationName).slice(0, 12),
    candidates: uniqBy(candidates, (site) => site.siteId ?? site.locationName).slice(0, 12),
    facilities: uniqBy(facilities, (facility) => facility.id ?? facility.name).slice(0, 12),
    indexedPlaces,
    activities,
  };
}

function resolveQueryPlace(input, showcaseData, candidateSites, existingFacilities, placeIndex) {
  const matched = buildMatchedEntities({ input, showcaseData, candidateSites, existingFacilities, placeIndex });
  const landmark = detectLandmark(input);
  const roadCenters = matched.roads.map((road) => road.coordinate).filter(Boolean);
  const roadTarget = roadCenters.length ? {
    targetName: matched.roads[0].roadName,
    targetType: "road",
    center: [
      roadCenters.reduce((sum, point) => sum + point[0], 0) / roadCenters.length,
      roadCenters.reduce((sum, point) => sum + point[1], 0) / roadCenters.length,
    ],
    radiusMeters: DEFAULT_RADIUS_METERS,
    relatedRoads: matched.roads.map((road) => road.roadName),
    relatedKeywords: matched.terms,
    matchedEntities: matched,
  } : null;

  if (matched.area) {
    return {
      targetName: matched.area.areaName,
      targetType: "known_area",
      center: matched.area.center,
      radiusMeters: matched.area.radiusMeters,
      relatedRoads: matched.area.relatedRoads,
      relatedKeywords: matched.area.relatedKeywords,
      matchedEntities: matched,
    };
  }
  if (landmark) {
    return {
      targetName: landmark.landmarkName,
      targetType: "landmark",
      center: landmark.center,
      radiusMeters: landmark.radiusMeters,
      relatedRoads: landmark.relatedRoads,
      relatedKeywords: landmark.relatedKeywords,
      matchedEntities: matched,
    };
  }
  if (roadTarget && isRoadLikeQuery(input, matched.terms)) return roadTarget;

  const firstCandidate = matched.candidates[0] ?? matched.scenarioFacilities[0] ?? matched.facilities[0];
  if (firstCandidate?.coordinate) {
    return {
      targetName: firstCandidate.locationName ?? firstCandidate.name,
      targetType: "facility_or_candidate",
      center: firstCandidate.coordinate,
      radiusMeters: DEFAULT_RADIUS_METERS,
      relatedRoads: [],
      relatedKeywords: matched.terms,
      matchedEntities: matched,
    };
  }

  const firstIndexedPlace = matched.indexedPlaces[0];
  if (firstIndexedPlace?.coordinate) {
    return {
      targetName: firstIndexedPlace.name,
      targetType: "indexed_place",
      center: firstIndexedPlace.coordinate,
      radiusMeters: DEFAULT_RADIUS_METERS,
      relatedRoads: [],
      relatedKeywords: [firstIndexedPlace.name, ...(firstIndexedPlace.aliases ?? []), ...matched.terms],
      matchedEntities: matched,
    };
  }

  if (roadTarget) return roadTarget;

  const firstActivity = matched.activities[0];
  if (firstActivity) {
    const originMatched = matched.terms.some((term) => String(firstActivity.origin_name ?? "").includes(term) || term.includes(String(firstActivity.origin_name ?? "")));
    const coordinate = originMatched
      ? [Number(firstActivity.origin_lon), Number(firstActivity.origin_lat)]
      : [Number(firstActivity.destination_lon), Number(firstActivity.destination_lat)];
    if (Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) {
      return {
        targetName: originMatched ? firstActivity.origin_name : (firstActivity.destination_name ?? firstActivity.origin_name),
        targetType: "activity_place",
        center: coordinate,
        radiusMeters: DEFAULT_RADIUS_METERS,
        relatedRoads: [],
        relatedKeywords: matched.terms,
        matchedEntities: matched,
      };
    }
  }

  return {
    targetName: matched.terms[0] ?? null,
    targetType: "unmatched_text",
    center: null,
    radiusMeters: DEFAULT_RADIUS_METERS,
    relatedRoads: [],
    relatedKeywords: matched.terms,
    matchedEntities: matched,
  };
}

function byDistanceOrName(center, relatedNames = []) {
  return (item) => {
    const name = getName(item);
    const coordinate = item.coordinate ?? getCoordinate(item);
    const nameMatched = relatedNames.some((related) => name.includes(related) || related.includes(name));
    if (nameMatched) return true;
    if (!center || !coordinate) return false;
    return haversineMeters(center, coordinate) <= DEFAULT_RADIUS_METERS;
  };
}

function summarizeScenarioCoverage(showcaseData) {
  const rows = showcaseData?.site_selection?.scenario_summary ?? [];
  return rows.map((row) => ({
    scenarioSize: row.scenario_size,
    method: row.scenario_method,
    selectedFacilities: row.selected_facilities,
    coverageRate: row.demand_coverage_rate,
    coveredDemandWeight: row.covered_demand_weight,
    remainingDemandWeight: row.remaining_demand_weight,
  }));
}

function isDistrictGapRankingQuery(input) {
  const text = normalizeText(input);
  const asksRanking = /哪里|哪儿|哪个|哪些|最大|最缺|最严重|最高|排行|排序|全区|海淀/.test(text);
  const asksPlanningData = /缺口|设施不足|服务不足|清凉设施|覆盖不足|热风险|风险|高温|暴露/.test(text);
  return asksRanking && asksPlanningData && !detectArea(input) && !detectLandmark(input);
}

function nearestIndexedPlaces(center, placeIndex, { limit = 3, radiusMeters = 900, coolingOnly = false } = {}) {
  if (!center || !placeIndex?.places?.length) return [];
  return placeIndex.places
    .map((place) => makeIndexedPlaceRecord(place, center))
    .filter((place) => Number.isFinite(place.distanceMeters) && place.distanceMeters <= radiusMeters)
    .filter((place) => !coolingOnly || place.isCoolingCandidate || place.reuseFunctions)
    .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
    .slice(0, limit);
}

function nearestRoadRecords(center, showcaseData, { limit = 3, radiusMeters = 900 } = {}) {
  if (!center) return [];
  return uniqBy(roadFeatures(showcaseData)
    .map((feature) => makeRoadRecord(feature, center))
    .filter((road) => road.roadName && road.roadName !== "（非成熟路线）")
    .filter((road) => Number.isFinite(road.distanceMeters) && road.distanceMeters <= radiusMeters)
    .filter((road) => Number.isFinite(Number(road.heatStress)))
    .sort((a, b) => Number(b.heatStress ?? -1) - Number(a.heatStress ?? -1) || Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity)),
    (road) => road.roadName)
    .slice(0, limit);
}

function makeDisplayNameFromContext({ nearbyPlaces = [], nearbyRoads = [] }) {
  const placeName = nearbyPlaces[0]?.name;
  const roadName = nearbyRoads[0]?.roadName;
  if (placeName && roadName) return `${placeName}周边`;
  if (placeName) return `${placeName}周边`;
  if (roadName) return `${roadName}沿线`;
  return "未命名缺口热点";
}

function enrichHotspotWithContext(hotspot, showcaseData, placeIndex) {
  const nearbyPlaces = nearestIndexedPlaces(hotspot.coordinate, placeIndex, { limit: 4, radiusMeters: 850 });
  const nearbyRoads = nearestRoadRecords(hotspot.coordinate, showcaseData, { limit: 4, radiusMeters: 850 });
  const nearbyCoolingPlaces = nearestIndexedPlaces(hotspot.coordinate, placeIndex, {
    limit: 4,
    radiusMeters: 1100,
    coolingOnly: true,
  });
  return {
    ...hotspot,
    displayName: makeDisplayNameFromContext({ nearbyPlaces, nearbyRoads }),
    nearbyPlaces,
    nearbyRoads,
    nearbyCoolingPlaces,
  };
}

function queryDistrictPlanningFacts({ input, showcaseData, placeIndex = null }) {
  const rankedHotspots = hotspotFeatures(showcaseData)
    .map((feature) => makeHotspotRecord(feature))
    .filter((hotspot) => Number.isFinite(Number(hotspot.demandWeight)))
    .sort((a, b) => Number(b.demandWeight ?? 0) - Number(a.demandWeight ?? 0))
    .slice(0, 10)
    .map((hotspot) => enrichHotspotWithContext(hotspot, showcaseData, placeIndex));

  const rankedPriorityEdges = priorityEdgeRecords(showcaseData)
    .map((edge) => ({
      roadName: edge.road_name,
      roadType: edge.fclass_cn,
      activityCount: edge.activity_count,
      agentCount: edge.agent_count,
      meanHeatStress: edge.mean_heat_stress,
      riskLevel: roadRiskLevel(edge.maximum_heat_stress ?? edge.mean_heat_stress),
      demandWeight: edge.edge_demand_weight,
      needCategories: edge.need_categories,
      coordinate: [Number(edge.lon), Number(edge.lat)],
    }))
    .filter((edge) => edge.roadName && Number.isFinite(Number(edge.demandWeight)))
    .sort((a, b) => Number(b.demandWeight ?? 0) - Number(a.demandWeight ?? 0))
    .slice(0, 10);

  const topHotspot = rankedHotspots[0];
  const topName = topHotspot?.displayName ?? "排名最高的缺口热点";
  const topRoads = topHotspot?.nearbyRoads?.slice(0, 2).map((road) => road.roadName).join("、");
  const conclusion = rankedHotspots.length
    ? `从全区设施缺口热点排序看，当前缺口最突出的区域是${topName}${topRoads ? `，邻近${topRoads}` : ""}。`
    : "当前全区缺口热点数据为空，暂时不能判断哪里缺口最大。";
  const recommendation = rankedHotspots.length
    ? "建议优先核验排名前3的缺口热点，并结合附近高热风险道路、可复用公共设施和权属条件生成候选点。"
    : "建议先重新执行设施缺口识别或检查热风险、活动暴露和现有设施覆盖数据。";

  return {
    targetName: "海淀区",
    areaName: "海淀区",
    targetType: "district_gap_ranking",
    radiusMeters: null,
    center: null,
    queryTerms: extractQueryTerms(input),
    relatedRoads: rankedPriorityEdges.map((edge) => edge.roadName).slice(0, 8),
    mapHit: rankedHotspots.length > 0 || rankedPriorityEdges.length > 0,
    hasFacilityGap: rankedHotspots.length > 0,
    nearbyGapCount: rankedHotspots.length,
    facilityGapHotspots: rankedHotspots,
    highRiskRoads: rankedPriorityEdges.slice(0, 8),
    priorityEdges: rankedPriorityEdges,
    hasCandidateSites: rankedHotspots.some((hotspot) => hotspot.nearbyCoolingPlaces?.length),
    nearbyCandidateSites: [],
    nearbyScenarioFacilities: [],
    indexedPlacesNearby: [],
    coolingPlacesNearby: rankedHotspots.flatMap((hotspot) => hotspot.nearbyCoolingPlaces ?? []).slice(0, 12),
    existingFacilitiesNearby: [],
    activityExposures: [],
    scenarioCoverage: summarizeScenarioCoverage(showcaseData),
    districtRankings: {
      gapHotspots: rankedHotspots,
      priorityEdges: rankedPriorityEdges,
    },
    matchedEntities: {
      roads: rankedPriorityEdges.map((edge) => edge.roadName).slice(0, 12),
      candidates: [],
      facilities: [],
      indexedPlaces: rankedHotspots.flatMap((hotspot) => hotspot.nearbyPlaces?.map((place) => place.name) ?? []).slice(0, 12),
      activities: [],
    },
    conclusion,
    recommendation,
    manualCheck: ["热点名称需现场定位确认", "权属与可布设空间", "道路红线与消防通道", "开放时间与运维责任"],
    evidenceSummary: [
      "查询对象：海淀区全区缺口排行",
      `设施缺口热点：${rankedHotspots.length}个`,
      `高优先级暴露路段：${rankedPriorityEdges.length}条`,
      topHotspot ? `最高需求权重：${Number(topHotspot.demandWeight).toFixed(2)}` : "最高需求权重：暂无",
    ],
  };
}

function summarizePriorityEdges(showcaseData, place) {
  const center = place.center;
  return priorityEdgeRecords(showcaseData)
    .map((edge) => {
      const coordinate = [Number(edge.lon), Number(edge.lat)];
      return {
        roadName: edge.road_name,
        roadType: edge.fclass_cn,
        activityCount: edge.activity_count,
        agentCount: edge.agent_count,
        meanHeatStress: edge.mean_heat_stress,
        riskLevel: roadRiskLevel(edge.maximum_heat_stress ?? edge.mean_heat_stress),
        demandWeight: edge.edge_demand_weight,
        needCategories: edge.need_categories,
        distanceMeters: center && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
          ? distanceToPoint(center, coordinate)
          : null,
      };
    })
    .filter((edge) => {
      const nameMatched = place.relatedRoads.some((road) => edge.roadName?.includes(road) || road.includes(edge.roadName));
      return nameMatched || (Number.isFinite(edge.distanceMeters) && edge.distanceMeters <= place.radiusMeters);
    })
    .sort((a, b) => Number(b.demandWeight ?? 0) - Number(a.demandWeight ?? 0))
    .slice(0, 8);
}

export function buildMapEntityIndex({ showcaseData, candidateSites = [], existingFacilities = [], placeIndex = null }) {
  const roadNames = uniqBy(
    roadFeatures(showcaseData)
      .map((feature) => feature.properties?.road_name)
      .filter((name) => name && name !== "（非成熟路线）"),
    (name) => name,
  );
  const scenarioFacilities = scenarioFacilityFeatures(showcaseData)
    .map((feature) => feature.properties?.poi_name)
    .filter(Boolean);
  const candidates = candidateSites.map((site) => site.locationName).filter(Boolean);
  const facilities = existingFacilities.map((facility) => facility.name ?? facility.locationName).filter(Boolean);
  const activityPlaces = activityRecords(showcaseData)
    .flatMap((activity) => [activity.origin_name, activity.destination_name])
    .filter(Boolean);

  return {
    areas: Object.keys(areaIndex),
    landmarks: Object.keys(landmarkIndex),
    indexedPlaceSample: (placeIndex?.places ?? []).slice(0, 500).map((place) => place.name),
    roadNames: roadNames.slice(0, 3000),
    candidateNames: uniqBy([...candidates, ...scenarioFacilities], (name) => name).slice(0, 500),
    facilityNames: uniqBy(facilities, (name) => name).slice(0, 500),
    activityPlaces: uniqBy(activityPlaces, (name) => name).slice(0, 500),
    counts: {
      roads: roadFeatures(showcaseData).length,
      gapHotspots: hotspotFeatures(showcaseData).length,
      scenarioFacilities: scenarioFacilityFeatures(showcaseData).length,
      activities: activityRecords(showcaseData).length,
      priorityEdges: priorityEdgeRecords(showcaseData).length,
      indexedPlaces: placeIndex?.placeCount ?? placeIndex?.places?.length ?? 0,
    },
  };
}

export function queryAreaPlanningFacts({ input, showcaseData, candidateSites = [], existingFacilities = [], placeIndex = null }) {
  if (isDistrictGapRankingQuery(input)) {
    return queryDistrictPlanningFacts({ input, showcaseData, placeIndex });
  }

  const place = resolveQueryPlace(input, showcaseData, candidateSites, existingFacilities, placeIndex);
  const relatedNames = [...place.relatedRoads, ...place.relatedKeywords, place.targetName].filter(Boolean);
  const center = place.center;
  const shouldExcludeTarget = /除了|之外/.test(String(input ?? ""));

  const facilityGapHotspots = hotspotFeatures(showcaseData)
    .map((feature) => makeHotspotRecord(feature, center))
    .filter((hotspot) => center && hotspot.distanceMeters <= place.radiusMeters)
    .sort((a, b) => Number(b.demandWeight ?? 0) - Number(a.demandWeight ?? 0))
    .slice(0, 10);

  const highRiskRoads = uniqBy(roadFeatures(showcaseData)
    .map((feature) => makeRoadRecord(feature, center))
    .filter((road) => road.roadName && road.roadName !== "（非成熟路线）")
    .map((road) => ({
      ...road,
      directMatch: relatedNames.some((name) => road.roadName.includes(name) || name.includes(road.roadName)),
    }))
    .filter((road) => {
      return road.directMatch || (center && road.distanceMeters <= place.radiusMeters);
    })
    .filter((road) => Number.isFinite(Number(road.heatStress)))
    .sort((a, b) => Number(b.directMatch) - Number(a.directMatch) || Number(b.heatStress ?? -1) - Number(a.heatStress ?? -1)), (road) => road.roadName)
    .slice(0, 12);

  const nearbyScenarioFacilities = uniqBy(scenarioFacilityFeatures(showcaseData)
    .map((feature) => makeScenarioFacilityRecord(feature, center))
    .filter(byDistanceOrName(center, relatedNames))
    .filter((site) => !shouldExcludeTarget || site.locationName !== place.targetName)
    .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
    , (site) => site.locationName)
    .slice(0, 12);

  const nearbyCandidateSites = uniqBy(candidateSites
    .map((site) => makeCandidateRecord(site, center))
    .filter(byDistanceOrName(center, relatedNames))
    .filter((site) => !shouldExcludeTarget || site.locationName !== place.targetName)
    .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
    , (site) => site.locationName)
    .slice(0, 12);

  const existingFacilitiesNearby = existingFacilities
    .map((facility) => makeFacilityRecord(facility, center))
    .filter(byDistanceOrName(center, relatedNames))
    .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
    .slice(0, 12);

  const indexedPlacesNearby = (placeIndex?.places ?? [])
    .map((indexedPlace) => makeIndexedPlaceRecord(indexedPlace, center))
    .filter((indexedPlace) => {
      if (!center || !Number.isFinite(indexedPlace.distanceMeters)) return false;
      if (shouldExcludeTarget && indexedPlace.name === place.targetName) return false;
      return indexedPlace.distanceMeters <= place.radiusMeters;
    })
    .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
    .slice(0, 20);

  const coolingPlacesNearby = indexedPlacesNearby
    .filter((indexedPlace) => indexedPlace.isCoolingCandidate || indexedPlace.reuseFunctions)
    .slice(0, 12);

  const activityExposures = activityRecords(showcaseData)
    .map((activity) => makeActivityRecord(activity, center))
    .filter((activity) => center && activity.distanceMeters <= place.radiusMeters)
    .sort((a, b) => Number(b.cumulativeHeatExposure ?? 0) - Number(a.cumulativeHeatExposure ?? 0))
    .slice(0, 8);

  const priorityEdges = summarizePriorityEdges(showcaseData, place);
  const hasFacilityGap = facilityGapHotspots.length > 0 || priorityEdges.length > 0;
  const hasCandidateSites = nearbyCandidateSites.length > 0 || nearbyScenarioFacilities.length > 0 || coolingPlacesNearby.length > 0;
  const mapHit = Boolean(place.center || highRiskRoads.length || nearbyScenarioFacilities.length || nearbyCandidateSites.length || place.matchedEntities.indexedPlaces.length);

  const targetLabel = place.targetName || "当前查询对象";
  const conclusion = !mapHit
    ? `当前地图索引没有命中“${targetLabel}”，不能判断该地点的热风险或设施缺口。`
    : hasFacilityGap && !hasCandidateSites
      ? `${targetLabel}周边存在设施缺口或高热暴露需求，但当前候选点清单未覆盖该范围。`
      : hasFacilityGap && hasCandidateSites
        ? `${targetLabel}周边存在设施缺口或高热暴露需求，且已有候选点或可复用设施可用于方案比选。`
        : `${targetLabel}周边当前未识别到明确设施缺口热点，但仍可结合道路热风险和活动暴露继续核验。`;

  const recommendation = !mapHit
    ? "建议先在地图中选点或补充更明确的道路、社区、学校、公交站名称。"
    : hasFacilityGap && !hasCandidateSites
      ? `建议将${targetLabel}纳入候选点搜索范围，重新执行候选点生成、空间约束检查和人工核验。`
      : hasFacilityGap
        ? "建议优先对附近候选点或可复用设施做空间约束检查，并比较公平优先与效率优先方案。"
        : "建议扩大查询半径，或检查当前热风险阈值和设施服务半径是否需要调整。";

  return {
    targetName: targetLabel,
    areaName: targetLabel,
    targetType: place.targetType,
    radiusMeters: place.radiusMeters,
    center,
    queryTerms: place.matchedEntities.terms,
    relatedRoads: relatedNames,
    mapHit,
    hasFacilityGap,
    nearbyGapCount: facilityGapHotspots.length,
    facilityGapHotspots,
    highRiskRoads,
    priorityEdges,
    hasCandidateSites,
    nearbyCandidateSites,
    nearbyScenarioFacilities,
    indexedPlacesNearby,
    coolingPlacesNearby,
    existingFacilitiesNearby,
    activityExposures,
    scenarioCoverage: summarizeScenarioCoverage(showcaseData),
    matchedEntities: {
      roads: place.matchedEntities.roads.map((road) => road.roadName).slice(0, 12),
      candidates: place.matchedEntities.candidates.map((site) => site.locationName).slice(0, 12),
      facilities: place.matchedEntities.facilities.map((facility) => facility.name).slice(0, 12),
      indexedPlaces: place.matchedEntities.indexedPlaces.map((indexedPlace) => indexedPlace.name).slice(0, 12),
      activities: place.matchedEntities.activities.map((activity) => activity.destination_name ?? activity.origin_name).slice(0, 12),
    },
    conclusion,
    recommendation,
    manualCheck: ["权属与可布设空间", "道路红线与消防通道", "现场遮阴与人流组织", "开放时间与运维责任"],
    evidenceSummary: [
      `命中对象：${targetLabel}`,
      `查询半径：${place.radiusMeters}米`,
      `设施缺口热点：${facilityGapHotspots.length}个`,
      `高热风险道路：${highRiskRoads.length}条`,
      `候选点：${nearbyCandidateSites.length + nearbyScenarioFacilities.length + coolingPlacesNearby.length}个`,
      `活动暴露记录：${activityExposures.length}条`,
    ],
  };
}
