import realAgentData from "../data/realAgentData.json" with { type: "json" };
import { queryAreaPlanningFacts } from "./areaPlanningFacts.js";

const QUERY_LABELS = {
  district_gap_ranking: "全区缺口排行",
  place_gap_lookup: "设施缺口分析",
  road_risk_lookup: "道路热风险查询",
  candidate_site_lookup: "候选点查询",
  compare_locations: "片区对比",
  follow_up_more: "继续查看结果",
};

const RAG_KEYWORDS = [
  "哪里", "哪儿", "哪些", "附近", "周边", "缺口", "清凉设施", "候选点", "点位", "选址", "布点",
  "热风险", "风险等级", "热压力", "高温", "覆盖", "最大", "最缺", "最严重", "排行", "排序",
  "治理", "怎么", "有没有", "是否", "存在", "路", "街", "大街", "公交站", "地铁站", "学校",
  "医院", "公园", "除此之外", "还有", "继续", "比较", "哪个更",
];

const STOP_WORDS = [
  "哪里", "哪儿", "哪些", "附近", "周边", "有没有", "是否", "存在", "设施缺口", "缺口",
  "清凉设施", "候选点", "点位", "选址", "布点", "热风险", "风险等级", "热压力", "高温",
  "治理", "怎么", "最大", "最缺", "最严重", "排行", "排序", "比较", "哪个更", "还有",
  "除此之外", "继续", "除了", "之外", "更缺", "更需要", "哪个", "缺", "呢", "吗", "的",
];

const CASUAL_WEATHER_RE = /天气|天儿|天冷|天热|下雨|降温|升温|风大|空气|穿什么|出门/;
const SPATIAL_TOPIC_RE = /缺口|设施不足|服务不足|清凉设施|候选点|点位|选址|布点|热风险|风险等级|热压力|高温|覆盖|暴露|治理|方案|比较|优先/;
const SPATIAL_CONTEXT_RE = /附近|周边|哪里|哪儿|哪些|海淀|片区|道路|路|街|大街|大道|桥|巷|胡同|社区|学校|医院|公园|公交站|地铁站|五道口|中关村|上地|北京林业大学/;

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function isFollowUpQuery(text) {
  return /除此之外|还有呢|还有吗|还有哪些|继续|更多|再说|别的/.test(text);
}

function makeDataMissAnswer(areaFacts) {
  const target = areaFacts?.targetName ?? "当前查询对象";
  return `${areaFacts?.conclusion ?? `当前地图索引没有命中“${target}”。`} 当前不能判断该地点的热风险、设施缺口、候选点或覆盖情况，也不会补造地图里没有的结论。建议换用更明确的地名、道路名、学校/公交站名，或扩大查询半径后重新计算缺口与候选点。`;
}

export function isSpatialRagCandidate(input) {
  const text = normalizeText(input);
  if (!text) return false;
  if (CASUAL_WEATHER_RE.test(text) && !SPATIAL_TOPIC_RE.test(text)) return false;
  if (isFollowUpQuery(text)) return true;
  return includesAny(text, RAG_KEYWORDS) && (SPATIAL_TOPIC_RE.test(text) || SPATIAL_CONTEXT_RE.test(text));
}

function extractTerms(input) {
  let text = normalizeText(input);
  STOP_WORDS.forEach((word) => {
    text = text.replaceAll(word, " ");
  });
  return Array.from(new Set((text.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) ?? [])
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_WORDS.includes(term))))
    .slice(0, 8);
}

function routeQuery(input, previousRagMemory = null) {
  const text = normalizeText(input);
  if (isFollowUpQuery(text) && previousRagMemory?.lastResults?.length) {
    return {
      queryType: "follow_up_more",
      label: QUERY_LABELS.follow_up_more,
      sourceQueryType: previousRagMemory.queryType,
      offset: previousRagMemory.shownResultCount ?? 0,
      limit: 3,
      terms: extractTerms(input),
    };
  }

  if (/和|与|跟|比|相比|哪个更|哪里更/.test(text) && /缺口|热风险|优先|更需要|更缺|比较/.test(text)) {
    return { queryType: "compare_locations", label: QUERY_LABELS.compare_locations, terms: extractTerms(input), limit: 3 };
  }

  if (/哪里|哪儿|哪些|最大|最缺|最严重|最高|排行|排序|全区|海淀/.test(text)
    && /缺口|设施不足|服务不足|清凉设施|覆盖不足|热风险|风险|高温|暴露/.test(text)) {
    return { queryType: "district_gap_ranking", label: QUERY_LABELS.district_gap_ranking, terms: extractTerms(input), limit: 5 };
  }

  if (/路|街|大街|大道|桥|巷|胡同|沿线/.test(text) && /热风险|风险等级|热压力|高温|风险/.test(text)) {
    return { queryType: "road_risk_lookup", label: QUERY_LABELS.road_risk_lookup, terms: extractTerms(input), limit: 5 };
  }

  if (/候选点|点位|选址|布点|可复用|清凉设施/.test(text) && /附近|周边|哪里|哪些|还有|推荐|可用/.test(text)) {
    return { queryType: "candidate_site_lookup", label: QUERY_LABELS.candidate_site_lookup, terms: extractTerms(input), limit: 5 };
  }

  return { queryType: "place_gap_lookup", label: QUERY_LABELS.place_gap_lookup, terms: extractTerms(input), limit: 5 };
}

function splitCompareTargets(input) {
  const text = normalizeText(input);
  const parts = text.split(/和|与|跟|相比|比/).map((part) => {
    let cleaned = part;
    STOP_WORDS.forEach((word) => {
      cleaned = cleaned.replaceAll(word, "");
    });
    return cleaned.trim();
  }).filter((part) => part.length >= 2);
  return parts.slice(0, 2);
}

function getCandidatePool(agentState) {
  return Array.isArray(agentState?.candidateSites) && agentState.candidateSites.length
    ? agentState.candidateSites
    : realAgentData.candidateSites ?? [];
}

function getExistingFacilities(agentState) {
  return agentState?.facilityAudit?.existingFacilities ?? realAgentData.facilityAudit?.existingFacilities ?? [];
}

function topCandidateText(site) {
  const name = site.locationName ?? site.name ?? "未命名候选点";
  const priority = site.priority ? `优先级 ${site.priority}` : site.score ? `评分 ${site.score}` : "待排序";
  const distance = site.distanceMeters ? `，约 ${site.distanceMeters} 米` : "";
  const functionText = site.facilityType ?? site.reuseFunctions ?? "清凉设施";
  return `${name}（${priority}${distance}，${functionText}）`;
}

function hotspotText(hotspot, index) {
  const name = hotspot.displayName ?? hotspot.hotspotId ?? `缺口热点 ${index + 1}`;
  const demand = Number.isFinite(Number(hotspot.demandWeight)) ? `需求权重 ${Number(hotspot.demandWeight).toFixed(1)}` : "需求权重待核验";
  const roads = hotspot.nearbyRoads?.slice(0, 2).map((road) => `${road.roadName}${road.riskLevel ? `（${road.riskLevel}风险）` : ""}`).join("、");
  const places = hotspot.nearbyPlaces?.slice(0, 2).map((place) => place.name).join("、");
  return `${index + 1}. ${name}：${demand}${roads ? `，邻近${roads}` : ""}${places ? `，参考地标${places}` : ""}`;
}

function roadText(road, index) {
  const heat = Number.isFinite(Number(road.heatStress ?? road.meanHeatStress))
    ? `热压力 ${Number(road.heatStress ?? road.meanHeatStress).toFixed(2)}`
    : "热压力待核验";
  return `${index + 1}. ${road.roadName}：${road.riskLevel ?? "风险待判定"}，${heat}`;
}

function clampScore(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function riskLevelScore(level) {
  if (/极高|extreme/i.test(String(level ?? ""))) return 32;
  if (/高|high/i.test(String(level ?? ""))) return 24;
  if (/中高|medium-high/i.test(String(level ?? ""))) return 18;
  if (/中|medium/i.test(String(level ?? ""))) return 12;
  if (/低|low/i.test(String(level ?? ""))) return 6;
  return 0;
}

function distanceScore(distanceMeters, radiusMeters) {
  const distance = Number(distanceMeters);
  const radius = Number(radiusMeters);
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 8;
  return clampScore((1 - Math.min(distance, radius) / radius) * 24, 0, 24);
}

function feasibilityScore(feasibility) {
  if (/high|高|优先|可优先/.test(String(feasibility ?? ""))) return 12;
  if (/medium|中|可考虑/.test(String(feasibility ?? ""))) return 7;
  if (/low|低|待核验/.test(String(feasibility ?? ""))) return 3;
  return 5;
}

function demandScore(item) {
  const demand = Number(item?.demandWeight ?? item?.coveredDemandWeight ?? 0);
  return clampScore(demand * 8, 0, 28);
}

function heatScore(item) {
  const heat = Number(item?.heatStress ?? item?.meanHeatStress ?? 0);
  return Number.isFinite(heat) && heat > 0
    ? clampScore(heat * 32, 0, 32)
    : riskLevelScore(item?.riskLevel);
}

function populationScore(item) {
  const population = Number(item?.coveredPopulation ?? 0);
  return clampScore(population / 450, 0, 14);
}

function candidatePriorityScore(item) {
  const priority = Number(item?.priority);
  if (Number.isFinite(priority) && priority > 0) return clampScore(13 - priority, 0, 12);
  const score = Number(item?.score);
  if (Number.isFinite(score)) return clampScore(score / 8, 0, 12);
  return 0;
}

function strategyFitScore(item, query) {
  const text = `${query?.terms?.join(" ") ?? ""} ${item?.facilityType ?? ""} ${item?.reuseFunctions ?? ""} ${item?.evidence ?? ""}`;
  let score = 0;
  if (/公平|老人|儿童|接送|弱势/.test(text)) score += 8;
  if (/效率|覆盖|人口/.test(text)) score += 6;
  if (/成本|存量|复用/.test(text)) score += 6;
  if (/应急|极高|高风险/.test(text)) score += 6;
  return clampScore(score, 0, 14);
}

function scoreEvidenceItem(item, itemType, { radiusMeters = null, query = null } = {}) {
  const signals = {
    distance: distanceScore(item?.distanceMeters, radiusMeters),
    heatRisk: heatScore(item),
    demand: demandScore(item),
    population: itemType === "candidate" ? populationScore(item) : 0,
    priority: itemType === "candidate" ? candidatePriorityScore(item) : 0,
    feasibility: itemType === "candidate" ? feasibilityScore(item?.feasibility ?? item?.publicness) : 0,
    strategyFit: itemType === "candidate" ? strategyFitScore(item, query) : 0,
  };

  if (itemType === "hotspot") {
    signals.heatRisk += (item?.nearbyRoads?.length ?? 0) * 2;
    signals.priority += Number(item?.priority) ? clampScore(10 - Number(item.priority), 0, 8) : 0;
  }

  if (itemType === "road") {
    signals.demand += clampScore(Number(item?.demandWeight ?? 0) * 6, 0, 18);
  }

  const ragScore = clampScore(Object.values(signals).reduce((sum, value) => sum + Number(value ?? 0), 0));
  return {
    ...item,
    ragScore: Math.round(ragScore * 10) / 10,
    scoringSignals: Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, Math.round(Number(value ?? 0) * 10) / 10])),
  };
}

function rankEvidenceItems(items = [], itemType, context = {}) {
  return [...items]
    .map((item) => scoreEvidenceItem(item, itemType, context))
    .sort((a, b) => Number(b.ragScore ?? 0) - Number(a.ragScore ?? 0));
}

function makeSpatialScope(query, facts) {
  const radius = facts?.radiusMeters;
  return {
    targetName: facts?.targetName ?? (query?.queryType === "district_gap_ranking" ? "海淀区" : "当前查询对象"),
    targetType: facts?.targetType ?? query?.queryType,
    radiusMeters: radius ?? null,
    center: facts?.center ?? null,
    scopeText: radius
      ? `以${facts?.targetName ?? "命中对象"}为中心约 ${radius} 米范围`
      : query?.queryType === "district_gap_ranking"
        ? "海淀区全区缺口热点排序"
        : "基于当前检索对象的空间索引范围",
  };
}

function makeRetrievedLayers(facts, query) {
  const layers = new Set();
  if (query?.queryType === "district_gap_ranking" || facts?.facilityGapHotspots?.length || facts?.districtRankings?.gapHotspots?.length) layers.add("设施缺口热点");
  if (facts?.highRiskRoads?.length || facts?.priorityEdges?.length) layers.add("道路热风险/高优先级暴露路段");
  if (facts?.nearbyCandidateSites?.length || facts?.nearbyScenarioFacilities?.length || facts?.coolingPlacesNearby?.length) layers.add("候选点/可复用设施");
  if (facts?.existingFacilitiesNearby?.length) layers.add("现有清凉设施");
  if (facts?.activityExposures?.length) layers.add("行为模拟/人群暴露");
  if (facts?.indexedPlacesNearby?.length) layers.add("地名与 POI 索引");
  return Array.from(layers);
}

function makeMatchedEntities(facts) {
  const entities = facts?.matchedEntities ?? {};
  return {
    roads: entities.roads ?? [],
    candidates: entities.candidates ?? [],
    facilities: entities.facilities ?? [],
    indexedPlaces: entities.indexedPlaces ?? [],
    activities: entities.activities ?? [],
  };
}

function summarizeRankingSignals(evidence = []) {
  const top = evidence[0];
  return {
    method: "距离 + 热风险 + 缺口需求 + 候选点优先级 + 可实施性 + 策略匹配",
    topScore: top?.ragScore ?? null,
    topSignals: top?.scoringSignals ?? null,
  };
}

function scoreAreaFacts(facts) {
  const gapScore = rankEvidenceItems(facts.facilityGapHotspots ?? [], "hotspot", { radiusMeters: facts.radiusMeters }).reduce((sum, item) => sum + Number(item.ragScore ?? 0), 0);
  const edgeScore = rankEvidenceItems(facts.priorityEdges ?? [], "road", { radiusMeters: facts.radiusMeters }).reduce((sum, item) => sum + Number(item.ragScore ?? 0), 0);
  const roadScore = rankEvidenceItems(facts.highRiskRoads ?? [], "road", { radiusMeters: facts.radiusMeters }).reduce((sum, item) => sum + Number(item.ragScore ?? 0), 0);
  return gapScore + edgeScore * 0.6 + roadScore * 0.4;
}

function retrieveSpatialEvidence({ query, input, showcaseData, placeIndex, agentState }) {
  const candidateSites = getCandidatePool(agentState);
  const existingFacilities = getExistingFacilities(agentState);

  if (query.queryType === "follow_up_more") {
    return { source: "conversation_memory", items: [] };
  }

  if (query.queryType === "compare_locations") {
    const targets = splitCompareTargets(input);
    const comparisons = targets.map((target) => {
      const facts = queryAreaPlanningFacts({ input: target, showcaseData, placeIndex, candidateSites, existingFacilities });
      return { target, facts, score: scoreAreaFacts(facts) };
    });
    return { source: "areaPlanningFacts", comparisons };
  }

  const areaFacts = queryAreaPlanningFacts({ input, showcaseData, placeIndex, candidateSites, existingFacilities });
  return { source: "areaPlanningFacts", areaFacts };
}

function buildEvidencePackage({ query, input, retrieved, previousRagMemory }) {
  if (query.queryType === "follow_up_more") {
    const offset = query.offset ?? 0;
    const items = previousRagMemory.lastResults.slice(offset, offset + query.limit);
    return {
      query,
      answerMode: "follow_up",
      title: QUERY_LABELS.follow_up_more,
      evidence: items,
      sourceAnswerMode: previousRagMemory.answerMode,
      shownResultCount: offset + items.length,
      spatialScope: previousRagMemory.spatialScope ?? null,
      retrievedLayers: previousRagMemory.retrievedLayers ?? [],
      matchedEntities: previousRagMemory.matchedEntities ?? {},
      rankingSignals: previousRagMemory.rankingSignals ?? null,
      dataBoundary: "基于上一轮已经检索到的空间证据继续展示",
      manualCheck: previousRagMemory.manualCheck ?? ["现场可布设空间", "权属与运维责任"],
      retrievalTrace: {
        route: "follow_up_more",
        source: "ragMemory",
        offset,
        returned: items.length,
        total: previousRagMemory.lastResults.length,
      },
    };
  }

  if (query.queryType === "compare_locations") {
    const comparisons = retrieved.comparisons ?? [];
    const sorted = [...comparisons].sort((a, b) => b.score - a.score);
    const retrievedLayers = Array.from(new Set(sorted.flatMap((item) => makeRetrievedLayers(item.facts, query))));
    return {
      query,
      answerMode: "comparison",
      title: QUERY_LABELS.compare_locations,
      evidence: sorted,
      shownResultCount: sorted.length,
      spatialScope: {
        targetName: "比较对象",
        targetType: "multi_location",
        radiusMeters: null,
        center: null,
        scopeText: "分别按每个命中地点的默认查询半径检索后进行相对比较",
      },
      retrievedLayers,
      matchedEntities: {
        targets: sorted.map((item) => item.target),
        byTarget: Object.fromEntries(sorted.map((item) => [item.target, makeMatchedEntities(item.facts)])),
      },
      rankingSignals: {
        method: "缺口热点分 + 优先暴露路段分 + 道路热风险分",
        scores: sorted.map((item) => ({ target: item.target, score: Math.round(Number(item.score ?? 0) * 10) / 10 })),
      },
      dataBoundary: "基于地点附近的缺口热点、优先路段和道路热风险进行相对比较",
      manualCheck: ["比较对象边界需确认", "现场可布设空间", "权属与实施条件"],
      retrievalTrace: {
        route: "compare_locations",
        source: retrieved.source,
        requestedTargets: comparisons.length,
        returned: sorted.length,
      },
    };
  }

  const facts = retrieved.areaFacts;
  if (!facts) return null;

  if (query.queryType === "district_gap_ranking" || facts.targetType === "district_gap_ranking") {
    const items = rankEvidenceItems(facts.districtRankings?.gapHotspots ?? facts.facilityGapHotspots ?? [], "hotspot", { radiusMeters: facts.radiusMeters, query });
    const relatedRoads = rankEvidenceItems(facts.priorityEdges ?? facts.highRiskRoads ?? [], "road", { radiusMeters: facts.radiusMeters, query });
    return {
      query,
      answerMode: "ranking",
      title: QUERY_LABELS.district_gap_ranking,
      areaFacts: facts,
      evidence: items,
      relatedRoads,
      shownResultCount: Math.min(3, items.length),
      spatialScope: makeSpatialScope(query, facts),
      retrievedLayers: makeRetrievedLayers(facts, query),
      matchedEntities: makeMatchedEntities(facts),
      rankingSignals: summarizeRankingSignals(items),
      dataBoundary: "基于当前高温风险、活动暴露、设施覆盖和缺口热点结果排序",
      manualCheck: facts.manualCheck ?? ["权属", "现场可布设空间", "消防通道"],
      retrievalTrace: {
        route: "district_gap_ranking",
        source: retrieved.source,
        returned: items.length,
        relatedRoads: relatedRoads.length,
      },
    };
  }

  const mergedCandidates = [
    ...(facts.nearbyCandidateSites ?? []),
    ...(facts.nearbyScenarioFacilities ?? []),
    ...(facts.coolingPlacesNearby ?? []),
  ];

  return {
    query,
    answerMode: query.queryType,
    title: QUERY_LABELS[query.queryType] ?? "空间证据查询",
    areaFacts: facts,
    evidence: query.queryType === "road_risk_lookup"
      ? rankEvidenceItems(facts.highRiskRoads ?? [], "road", { radiusMeters: facts.radiusMeters, query })
      : query.queryType === "candidate_site_lookup"
        ? rankEvidenceItems(mergedCandidates, "candidate", { radiusMeters: facts.radiusMeters, query })
        : rankEvidenceItems(facts.facilityGapHotspots ?? [], "hotspot", { radiusMeters: facts.radiusMeters, query }),
    candidates: rankEvidenceItems(mergedCandidates, "candidate", { radiusMeters: facts.radiusMeters, query }),
    roads: rankEvidenceItems(facts.highRiskRoads ?? [], "road", { radiusMeters: facts.radiusMeters, query }),
    shownResultCount: Math.min(3, (facts.facilityGapHotspots ?? []).length || mergedCandidates.length || (facts.highRiskRoads ?? []).length),
    spatialScope: makeSpatialScope(query, facts),
    retrievedLayers: makeRetrievedLayers(facts, query),
    matchedEntities: makeMatchedEntities(facts),
    rankingSignals: summarizeRankingSignals(query.queryType === "road_risk_lookup"
      ? rankEvidenceItems(facts.highRiskRoads ?? [], "road", { radiusMeters: facts.radiusMeters, query })
      : query.queryType === "candidate_site_lookup"
        ? rankEvidenceItems(mergedCandidates, "candidate", { radiusMeters: facts.radiusMeters, query })
        : rankEvidenceItems(facts.facilityGapHotspots ?? [], "hotspot", { radiusMeters: facts.radiusMeters, query })),
    dataBoundary: "基于当前地图索引、道路热风险、设施缺口和候选点数据",
    manualCheck: facts.manualCheck ?? ["权属", "现场可布设空间", "开放时间"],
    retrievalTrace: {
      route: query.queryType,
      source: retrieved.source,
      mapHit: facts.mapHit,
      radiusMeters: facts.radiusMeters,
      returned: {
        gaps: facts.facilityGapHotspots?.length ?? 0,
        roads: facts.highRiskRoads?.length ?? 0,
        candidates: mergedCandidates.length,
      },
    },
  };
}

function planAnswer(evidencePackage) {
  const mode = evidencePackage?.answerMode;
  if (mode === "ranking") return ["直接结论", "排名前三", "排序依据", "下一步建议", "人工核验"];
  if (mode === "comparison") return ["比较结论", "双方证据", "优先建议", "核验边界"];
  if (mode === "road_risk_lookup") return ["风险结论", "道路证据", "治理建议"];
  if (mode === "candidate_site_lookup") return ["是否有候选点", "候选点清单", "核验事项"];
  if (mode === "follow_up") return ["继续展示", "剩余结果", "下一步"];
  return ["是否存在缺口", "证据", "候选点", "人工核验"];
}

function generateGroundedAnswer(evidencePackage) {
  if (!evidencePackage) {
    return {
      title: "数据不足",
      text: "当前没有形成可用的空间证据包，不能直接判断设施缺口或候选点。建议先检查地图数据是否加载完成。",
      chips: ["数据不足"],
    };
  }

  const { answerMode, areaFacts } = evidencePackage;
  if (answerMode === "follow_up") {
    const lines = evidencePackage.evidence.map((item, index) => {
      if (evidencePackage.sourceAnswerMode === "road_risk_lookup") return roadText(item, index);
      if (evidencePackage.sourceAnswerMode === "candidate_site_lookup") return `${index + 1}. ${topCandidateText(item)}`;
      return hotspotText(item, index);
    });
    const subject = evidencePackage.sourceAnswerMode === "road_risk_lookup"
      ? "道路热风险记录"
      : evidencePackage.sourceAnswerMode === "candidate_site_lookup"
        ? "候选点或可复用设施"
        : "缺口热点";
    return {
      title: evidencePackage.title,
      text: lines.length
        ? `继续看上一轮结果，后续${subject}包括：${lines.join("；")}。上一轮范围为：${evidencePackage.spatialScope?.scopeText ?? evidencePackage.dataBoundary}。这些点仍需核验${evidencePackage.manualCheck.join("、")}。`
        : "上一轮结果已经展示完了。可以换一个片区、道路或约束继续查询。",
      chips: [evidencePackage.title],
    };
  }

  if (answerMode === "ranking") {
    const topItems = evidencePackage.evidence.slice(0, 3);
    const lines = topItems.map((item, index) => hotspotText(item, index));
    const roadLines = evidencePackage.relatedRoads?.slice(0, 4).map((road) => road.roadName ? `${road.roadName}（${road.riskLevel ?? "风险待判定"}）` : null).filter(Boolean);
    return {
      title: evidencePackage.title,
      text: `${areaFacts?.conclusion ?? "已完成全区缺口排序。"} 检索范围：${evidencePackage.spatialScope?.scopeText ?? "当前研究区"}。排名前三是：${lines.join("；") || "暂无可排序缺口热点"}。排序综合考虑${evidencePackage.rankingSignals?.method ?? "缺口热点需求权重、暴露路段和周边高热风险道路"}${evidencePackage.rankingSignals?.topScore ? `，首位综合分约 ${evidencePackage.rankingSignals.topScore}` : ""}。${roadLines?.length ? `相关高优先级道路包括：${roadLines.join("、")}。` : ""}${areaFacts?.recommendation ?? "建议优先核验排名靠前区域并生成候选点。"} 人工核验重点：${evidencePackage.manualCheck.join("、")}。`,
      chips: [evidencePackage.title, "证据排序"],
    };
  }

  if (answerMode === "comparison") {
    const items = evidencePackage.evidence;
    const comparableItems = items.filter((item) => item.facts?.mapHit !== false);
    const first = comparableItems[0];
    const lines = items.map((item) => {
      if (item.facts?.mapHit === false) return `${item.target}：当前地图索引未命中，不能参与实质比较`;
      const matchedRoads = item.facts?.highRiskRoads?.slice(0, 2).map((road) => road.roadName).filter(Boolean).join("、");
      const matchedCandidates = [
        ...(item.facts?.nearbyCandidateSites ?? []),
        ...(item.facts?.nearbyScenarioFacilities ?? []),
        ...(item.facts?.coolingPlacesNearby ?? []),
      ].slice(0, 2).map((site) => site.locationName ?? site.name).filter(Boolean).join("、");
      return `${item.target}：综合缺口分 ${item.score.toFixed(1)}，${item.facts?.hasFacilityGap ? "存在缺口证据" : "缺口证据较弱"}${matchedRoads ? `，命中道路 ${matchedRoads}` : ""}${matchedCandidates ? `，候选/可复用设施 ${matchedCandidates}` : ""}`;
    }).join("；");
    return {
      title: evidencePackage.title,
      text: first
        ? `按当前数据，${first.target}的优先级更高。${lines}。比较方法：${evidencePackage.rankingSignals?.method ?? "缺口热点、优先暴露路段和道路热风险相对强度"}。这个结果不代表最终建设排序；仍需核验${evidencePackage.manualCheck.join("、")}。`
        : items.length
          ? `当前没有足够的地图命中结果支撑片区比较。${lines}。请换用地图索引中已有的道路、社区、学校或公交站名，或扩大半径后重新计算缺口。`
          : "当前没有解析出两个明确比较对象，请补充两个片区、道路或设施点名称。",
      chips: [evidencePackage.title, "相对比较"],
    };
  }

  if (answerMode === "road_risk_lookup") {
    const roads = evidencePackage.roads ?? evidencePackage.evidence ?? [];
    const lines = roads.slice(0, 5).map((road, index) => roadText(road, index));
    return {
      title: evidencePackage.title,
      text: roads.length
        ? `${areaFacts.targetName}相关道路热风险如下：${lines.join("；")}。检索范围：${evidencePackage.spatialScope?.scopeText ?? "当前道路索引范围"}。道路排序综合考虑热压力、暴露需求和距离。建议优先在高风险路段叠加遮阴、饮水和短暂停留点，并结合行人流线确认布设位置。`
        : areaFacts?.mapHit === false
          ? makeDataMissAnswer(areaFacts)
          : `${areaFacts.targetName}没有命中可解释的道路热风险记录，不能编造风险等级。建议换用更明确的道路名、扩大查询半径，或在地图上选取路段后重新计算。`,
      chips: [evidencePackage.title, "道路热风险"],
    };
  }

  if (answerMode === "candidate_site_lookup") {
    const candidates = evidencePackage.candidates ?? evidencePackage.evidence ?? [];
    const lines = candidates.slice(0, 5).map(topCandidateText);
    return {
      title: evidencePackage.title,
      text: candidates.length
        ? `${areaFacts.targetName}附近可参考的候选点或可复用设施包括：${lines.join("；")}。检索范围：${evidencePackage.spatialScope?.scopeText ?? "当前候选点索引范围"}。排序综合考虑距离、风险、覆盖人口、可实施性和策略匹配。这些点只是基于当前候选点和 POI 索引生成的规划证据，落地前要核验${evidencePackage.manualCheck.join("、")}。`
        : areaFacts?.mapHit === false
          ? makeDataMissAnswer(areaFacts)
          : `${areaFacts.targetName}附近当前没有命中候选点清单，但${areaFacts.hasFacilityGap ? "已有设施缺口或高热暴露证据，建议重跑候选点生成。" : "缺口证据也不明显，建议扩大半径或检查数据阈值。"}`,
      chips: [evidencePackage.title, candidates.length ? "候选点命中" : "需重算候选点"],
    };
  }

  if (areaFacts?.mapHit === false) {
    return {
      title: evidencePackage.title,
      text: `${makeDataMissAnswer(areaFacts)} 人工核验重点：${evidencePackage.manualCheck.join("、")}。`,
      chips: [evidencePackage.title, "数据未命中"],
    };
  }

  const gaps = evidencePackage.evidence ?? [];
  const candidates = evidencePackage.candidates ?? [];
  const roads = evidencePackage.roads ?? [];
  const gapText = gaps.length ? `识别到 ${gaps.length} 个设施缺口热点` : "当前没有明确缺口热点";
  const roadTextValue = roads.length ? `相关高热风险道路包括：${roads.slice(0, 3).map((road) => `${road.roadName}（${road.riskLevel}）`).join("、")}。` : "";
  const candidateText = candidates.length ? `附近可参考候选点包括：${candidates.slice(0, 3).map(topCandidateText).join("；")}。` : "当前候选点清单未覆盖该范围。";
  return {
    title: evidencePackage.title,
    text: `${areaFacts?.conclusion ?? ""}${gapText}。检索范围：${evidencePackage.spatialScope?.scopeText ?? "当前地图索引范围"}。${roadTextValue}${candidateText}排序综合考虑${evidencePackage.rankingSignals?.method ?? "距离、风险、缺口需求和候选点可实施性"}。${areaFacts?.recommendation ?? "建议结合现场条件继续核验。"} 人工核验重点：${evidencePackage.manualCheck.join("、")}。`,
    chips: [evidencePackage.title, areaFacts?.hasFacilityGap ? "有缺口证据" : "证据较弱"],
  };
}

function makeRagMemory({ query, evidencePackage, answer, previousRagMemory = null }) {
  if (query.queryType === "follow_up_more" && previousRagMemory) {
    return {
      ...previousRagMemory,
      lastAnswerTitle: answer.title,
      shownResultCount: evidencePackage?.shownResultCount ?? previousRagMemory.shownResultCount,
      updatedAt: new Date().toISOString(),
    };
  }

  const evidence = evidencePackage?.evidence ?? [];
  return {
    queryType: query.queryType,
    queryLabel: query.label,
    answerMode: evidencePackage?.answerMode,
    lastAnswerTitle: answer.title,
    lastResults: evidence,
    shownResultCount: evidencePackage?.shownResultCount ?? Math.min(3, evidence.length),
    totalCount: evidence.length,
    spatialScope: evidencePackage?.spatialScope ?? null,
    retrievedLayers: evidencePackage?.retrievedLayers ?? [],
    matchedEntities: evidencePackage?.matchedEntities ?? {},
    rankingSignals: evidencePackage?.rankingSignals ?? null,
    retrievalTrace: evidencePackage?.retrievalTrace ?? null,
    manualCheck: evidencePackage?.manualCheck ?? [],
    dataBoundary: evidencePackage?.dataBoundary,
    updatedAt: new Date().toISOString(),
  };
}

export function runSpatialRag({ input, agentState, showcaseData, placeIndex, previousRagMemory = null }) {
  if (!isSpatialRagCandidate(input)) {
    return { handled: false };
  }

  const text = normalizeText(input);
  if (isFollowUpQuery(text) && !previousRagMemory?.lastResults?.length) {
    const answer = {
      title: QUERY_LABELS.follow_up_more,
      text: "这是一条连续追问，但当前还没有上一轮空间检索结果可继续展开。请先问一个具体的空间问题，例如“哪里设施缺口最大”“某地附近有没有设施缺口”或“某条路热风险等级是什么”。",
      chips: [QUERY_LABELS.follow_up_more, "缺少上下文"],
    };
    return {
      handled: true,
      query: {
        queryType: "follow_up_more",
        label: QUERY_LABELS.follow_up_more,
        terms: extractTerms(input),
        limit: 3,
      },
      retrieved: { source: "conversation_memory", items: [] },
      evidencePackage: {
        query: { queryType: "follow_up_more", label: QUERY_LABELS.follow_up_more },
        answerMode: "follow_up",
        title: QUERY_LABELS.follow_up_more,
        evidence: [],
        answerPlan: ["说明缺少上一轮结果", "提示可查询的问题类型"],
        dataBoundary: "没有可复用的上一轮 ragMemory",
        manualCheck: [],
        retrievalTrace: {
          route: "follow_up_more",
          source: "ragMemory",
          returned: 0,
          reason: "missing_previous_rag_memory",
        },
      },
      answer,
      ragMemory: null,
    };
  }

  const query = routeQuery(input, previousRagMemory);
  const retrieved = retrieveSpatialEvidence({ query, input, showcaseData, placeIndex, agentState });
  const evidencePackage = buildEvidencePackage({ query, input, retrieved, previousRagMemory });
  const answerPlan = planAnswer(evidencePackage);
  const answer = generateGroundedAnswer(evidencePackage);
  const ragMemory = makeRagMemory({ query, evidencePackage, answer, previousRagMemory });

  return {
    handled: true,
    query,
    retrieved,
    evidencePackage: {
      ...evidencePackage,
      answerPlan,
    },
    answer,
    ragMemory,
    ragDebug: {
      queryType: query.queryType,
      retrievedLayers: evidencePackage?.retrievedLayers ?? [],
      spatialScope: evidencePackage?.spatialScope ?? null,
      matchedEntities: evidencePackage?.matchedEntities ?? {},
      rankingSignals: evidencePackage?.rankingSignals ?? null,
      retrievalTrace: evidencePackage?.retrievalTrace ?? null,
    },
  };
}
