import realAgentData from "../data/realAgentData.json" with { type: "json" };
import { detectArea, queryAreaPlanningFacts } from "./areaPlanningFacts.js";
import { INTENT_ROUTES, routeAgentIntent } from "./intentRouter.js";
import { runSpatialRag, isSpatialRagCandidate } from "./spatialRag.js";

export const DEEPSEEK_INTENT_SYSTEM_PROMPT = `
你是“高温设施规划 Agent”的意图理解与规划模块。

你的任务不是直接生成规划结论，而是：
1. 判断用户输入是否属于高温设施规划场景；
2. 如果不属于，只做简短边界回复，不触发规划工作流；
3. 如果属于，提取用户目标、人群、设施对象、策略偏好、约束条件；
4. 判断任务类型；
5. 判断是否需要前置分析；
6. 生成结构化任务计划；
7. 所有输出必须是 JSON，不允许只输出自然语言；
8. 不能编造点位、覆盖率、人口数量和方案结果；
9. 候选点、方案比选和证据必须来自 AgentState 或工具结果；
10. 如果缺少前置条件，必须先补齐风险诊断、人群暴露、设施覆盖和设施缺口分析；
11. 如果用户新增约束，需要判断影响步骤、可保留结果和重算起点；
12. 如果用户问无关问题，需要回答该问题或说明边界，但不能套用规划答案。
`;

const TASK_LABELS = {
  risk_diagnosis: "风险诊断",
  facility_gap_analysis: "设施缺口识别",
  candidate_site_generation: "候选点推荐",
  scenario_comparison: "方案比选",
  constraint_revision: "约束调整",
  report_generation: "报告生成",
  goal_understanding: "目标理解",
};

const PLANNING_KEYWORDS = [
  "高温", "热", "热风险", "风险", "暴露", "老人", "老年", "儿童", "学校", "接送", "户外劳动",
  "清凉", "设施", "遮阴", "饮水", "休憩", "驿站", "避暑", "覆盖", "缺口", "可达", "步行",
  "候选点", "选点", "布点", "方案", "比选", "公平", "效率", "成本", "应急", "约束", "避开",
  "道路红线", "消防", "社区服务中心", "治理", "街道", "街", "社区", "公园", "公交",
];

const CONSTRAINT_KEYWORDS = ["避开", "不要", "不能", "降低成本", "低成本", "存量", "优先利用", "300", "15分钟", "可达", "学校门口", "消防", "道路红线"];
const REPORT_KEYWORDS = ["报告", "汇报", "导出", "材料", "审议"];
const GAP_KEYWORDS = ["缺", "缺口", "覆盖", "到不了", "15分钟", "可达", "盲区"];
const RISK_KEYWORDS = ["哪里热", "最热", "高温风险", "风险最高", "风险区"];
const SCENARIO_KEYWORDS = ["比选", "哪个更好", "公平优先", "效率优先", "低成本", "应急优先", "覆盖率能提升"];

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function formatToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}年${month}月${day}日`;
}

function hasDiagnosis(agentState) {
  return Boolean(agentState?.diagnosis?.highRiskZones?.length || agentState?.diagnosis?.priorityCells?.length);
}

function hasExposure(agentState) {
  return Boolean(agentState?.diagnosis?.exposedPopulation || agentState?.diagnosis?.activityHotspots?.length);
}

function hasFacilityAudit(agentState) {
  return Boolean(agentState?.facilityAudit?.existingFacilities?.length || agentState?.facilityAudit?.coverageRate);
}

function hasFacilityGaps(agentState) {
  return Boolean(agentState?.facilityAudit?.facilityGaps?.length || agentState?.facilityAudit?.candidateSearchArea?.length);
}

function deriveTaskType(text) {
  if (includesAny(text, CONSTRAINT_KEYWORDS)) return "constraint_revision";
  if (includesAny(text, REPORT_KEYWORDS)) return "report_generation";
  if (includesAny(text, SCENARIO_KEYWORDS)) return "scenario_comparison";
  if (/优先|保障|老人|老年|儿童|学生|接送|家庭|弱势|户外|劳动/.test(text)) return "candidate_site_generation";
  if (includesAny(text, ["在哪里", "应该在哪", "布置", "补充", "新增", "候选", "选点", "治理"])) return "candidate_site_generation";
  if (includesAny(text, GAP_KEYWORDS)) return "facility_gap_analysis";
  if (includesAny(text, RISK_KEYWORDS)) return "risk_diagnosis";
  return "goal_understanding";
}

function deriveTargetGroups(text) {
  const groups = [];
  if (/老人|老年/.test(text)) groups.push("老人");
  if (/儿童|学校|接送|学生|家庭/.test(text)) groups.push("接送学家庭");
  if (/户外|劳动/.test(text)) groups.push("户外劳动者");
  return groups.length ? groups : ["重点暴露人群"];
}

function deriveStrategy(text, fallbackStrategy = "公平优先") {
  if (/效率/.test(text)) return "效率优先";
  if (/低成本|成本|存量/.test(text)) return "低成本优先";
  if (/应急/.test(text)) return "应急优先";
  if (/公平|老人|儿童|接送/.test(text)) return "公平优先";
  return fallbackStrategy || "公平优先";
}

function derivePlanningObject(text) {
  if (/饮水|补水/.test(text)) return "饮水点与补水设施";
  if (/遮阴|遮阳/.test(text)) return "遮阴设施";
  if (/休憩|休息/.test(text)) return "休憩设施";
  return "清凉设施";
}

function deriveConstraints(text) {
  const constraints = [];
  if (/高温风险区|风险区/.test(text)) constraints.push("限定高温风险区");
  if (/避开学校门口|学校门口/.test(text)) constraints.push("避开学校门口");
  if (/道路红线/.test(text)) constraints.push("避开道路红线");
  if (/消防/.test(text)) constraints.push("避开消防通道");
  if (/300/.test(text)) constraints.push("步行距离小于300米");
  if (/15分钟/.test(text)) constraints.push("15分钟可达");
  if (/低成本|成本/.test(text)) constraints.push("低成本优先");
  if (/社区服务中心|存量/.test(text)) constraints.push("优先存量复用");
  return constraints;
}

function getCandidatePool(agentState) {
  return Array.isArray(agentState?.candidateSites) && agentState.candidateSites.length
    ? agentState.candidateSites
    : realAgentData.candidateSites ?? [];
}

function getFacilityGaps(agentState) {
  return Array.isArray(agentState?.facilityAudit?.facilityGaps) && agentState.facilityAudit.facilityGaps.length
    ? agentState.facilityAudit.facilityGaps
    : realAgentData.facilityAudit?.facilityGaps ?? [];
}

function getHighRiskZones(agentState) {
  return Array.isArray(agentState?.diagnosis?.highRiskZones) && agentState.diagnosis.highRiskZones.length
    ? agentState.diagnosis.highRiskZones
    : realAgentData.diagnosis?.highRiskZones ?? [];
}

function extractQueryTerms(text) {
  const cleaned = text
    .replace(/候选设施|候选点|点位|有哪些|有那些|还有哪些|还有|附近|清凉设施|怎么治理|怎么|治理|请问|一下/g, " ")
    .replace(/每条路|热风险等级|热风险|风险等级|是什么|多少|如何/g, " ");
  return Array.from(new Set((cleaned.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) ?? [])
    .filter((term) => !["哪些", "还有", "附近", "怎么", "治理", "候选点", "候选设施", "清凉设施", "点位"].includes(term))))
    .slice(0, 6);
}

function findRelevantCandidates(text, agentState) {
  const sites = getCandidatePool(agentState);
  const terms = extractQueryTerms(text);
  const matched = terms.length
    ? sites.filter((site) => terms.some((term) => String(site.locationName ?? "").includes(term) || String(site.evidence ?? "").includes(term)))
    : [];
  return (matched.length ? matched : sites).slice(0, 6);
}

function isCandidateDataQuestion(text) {
  return /候选点|点位|选点|布点|有哪些点|哪些点/.test(text);
}

function isRoadRiskDataQuestion(text) {
  return /路|道路|街|街道|热风险等级|热压力|风险等级/.test(text) && /热|风险|等级|压力/.test(text);
}

function makeCandidateDataReply(text, agentState) {
  const sites = getCandidatePool(agentState);
  const relevantSites = findRelevantCandidates(text, agentState);
  const terms = extractQueryTerms(text);
  const hasDirectHit = terms.length
    ? sites.some((site) => terms.some((term) => String(site.locationName ?? "").includes(term) || String(site.evidence ?? "").includes(term)))
    : true;

  const siteLines = relevantSites.map((site) => {
    const people = site.coveredPopulation ? `覆盖约${Number(site.coveredPopulation).toLocaleString()}人` : "覆盖人口待核验";
    const score = site.score ? `得分${site.score}` : `优先级${site.priority ?? "待排序"}`;
    const risk = site.riskLevel ? `风险等级${site.riskLevel}` : "风险等级待核验";
    return `${site.priority ?? "-"}）${site.locationName}：${people}，${score}，${risk}`;
  }).join("；");

  const prefix = !terms.length
    ? "当前真实候选点数据中，优先候选设施点包括："
    : hasDirectHit
      ? "我从当前真实候选点数据中查到："
      : `当前候选点清单里没有直接命中“${terms.join("、")}”的点位。可复用的优先候选点包括：`;
  return `${prefix}${siteLines || "暂无候选点数据"}。这些点仍需要结合权属、施工条件和现场安全做人工核验。`;
}

function makeRoadRiskDataReply(text) {
  const terms = extractQueryTerms(text);
  if (!terms.length) {
    return "道路热风险图层已经接入地图，但道路级数据量较大，不适合一次性在对话中列出全部道路。请指定道路或片区，例如“远大路热风险等级是什么”，我会优先从道路热压力数据中查询；如果数据未命中，我会明确说明。";
  }
  return `我会查询“${terms.join("、")}”相关道路的热风险等级。若当前道路热压力数据未命中该道路，我会明确说明未命中，不会编造等级。`;
}

function isAreaFactQuestion(text) {
  return Boolean(detectArea(text)) || /附近|周边|道路|路|街|社区|学校|医院|公园|地铁站|公交站|候选点|点位|设施|缺口|覆盖|热风险|风险等级|存在|有没有|是否|治理|怎么|如何|哪里|哪些/.test(text);
}

function formatAreaFactsReply(areaFacts) {
  if (!areaFacts) return null;
  if (areaFacts.mapHit === false) {
    return `${areaFacts.conclusion}${areaFacts.recommendation} 我不会为未命中的地点编造候选点、风险等级或设施缺口。`;
  }
  if (areaFacts.targetType === "district_gap_ranking") {
    const topHotspots = areaFacts.districtRankings?.gapHotspots?.slice(0, 3) ?? [];
    const topText = topHotspots.map((hotspot, index) => {
      const roads = hotspot.nearbyRoads?.slice(0, 2).map((road) => `${road.roadName}${road.riskLevel ? `（${road.riskLevel}风险）` : ""}`).join("、");
      const places = hotspot.nearbyPlaces?.slice(0, 2).map((place) => place.name).join("、");
      const demand = Number.isFinite(Number(hotspot.demandWeight)) ? `需求权重 ${Number(hotspot.demandWeight).toFixed(1)}` : "需求权重待核验";
      return `${index + 1}. ${hotspot.displayName ?? hotspot.hotspotId}：${demand}${roads ? `，邻近${roads}` : ""}${places ? `，参考地标${places}` : ""}`;
    }).join("；");
    const edgeText = areaFacts.priorityEdges?.length
      ? `高优先级暴露路段还包括：${areaFacts.priorityEdges.slice(0, 4).map((edge) => `${edge.roadName}（${edge.riskLevel}）`).join("、")}。`
      : "";
    const coverageText = areaFacts.scenarioCoverage?.length
      ? `现有方案模拟可继续用于比较公平优先、效率优先和低成本优先策略。`
      : "";
    return `${areaFacts.conclusion} 排名前三的缺口热点是：${topText || "暂无可排序热点"}。${edgeText}${coverageText}${areaFacts.recommendation} 人工核验重点：${areaFacts.manualCheck.join("、")}。`;
  }
  const roadText = areaFacts.highRiskRoads?.length
    ? `相关高热风险道路包括：${areaFacts.highRiskRoads.slice(0, 4).map((road) => `${road.roadName}（${road.riskLevel}${road.heatStress ? `，热压力${Number(road.heatStress).toFixed(2)}` : ""}）`).join("、")}。`
    : "当前未命中可解释的道路热压力记录。";
  const gapText = areaFacts.hasFacilityGap
    ? `识别到 ${areaFacts.nearbyGapCount} 个设施缺口热点，另有 ${areaFacts.priorityEdges?.length ?? 0} 条高优先级暴露路段。`
    : "当前未识别到设施缺口热点。";
  const mergedCandidates = [
    ...(areaFacts.nearbyCandidateSites ?? []),
    ...(areaFacts.nearbyScenarioFacilities ?? []),
    ...(areaFacts.coolingPlacesNearby ?? []),
  ];
  const candidateText = mergedCandidates.length
    ? `附近候选点或可复用设施包括：${mergedCandidates.slice(0, 5).map((site) => `${site.locationName ?? site.name}（${site.priority ? `优先级${site.priority}` : site.reuseFunctions || "待评估"}${site.distanceMeters ? `，约${site.distanceMeters}米` : ""}）`).join("、")}。`
    : "当前候选点清单未覆盖该范围。";
  const activityText = areaFacts.activityExposures?.length
    ? `关联活动暴露记录 ${areaFacts.activityExposures.length} 条，涉及${Array.from(new Set(areaFacts.activityExposures.map((item) => item.agentLabel).filter(Boolean))).slice(0, 3).join("、") || "重点人群"}。`
    : "";
  return `${areaFacts.conclusion}${gapText}${roadText}${candidateText}${activityText}${areaFacts.recommendation} 人工核验重点：${areaFacts.manualCheck.join("、")}。`;
}

function listMissingPreconditions(agentState, taskType) {
  const needs = [];
  if (["facility_gap_analysis", "candidate_site_generation", "scenario_comparison", "report_generation"].includes(taskType)) {
    if (!hasDiagnosis(agentState)) needs.push("风险诊断结果");
    if (!hasExposure(agentState)) needs.push("人群暴露结果");
  }
  if (["candidate_site_generation", "scenario_comparison", "report_generation"].includes(taskType)) {
    if (!hasFacilityAudit(agentState)) needs.push("设施覆盖结果");
    if (!hasFacilityGaps(agentState)) needs.push("设施缺口结果");
  }
  return needs;
}

function isDateQuestion(text) {
  return /今天几|今天是几|今天日期|今天星期|几号|日期/.test(text);
}

function isCapabilityQuestion(text) {
  return /你是谁|你能做什么|怎么用|可以做什么|帮助/.test(text);
}

function isGreeting(text) {
  return /^(你好|您好|hello|hi|嗨|在吗)[。！？!?\s]*$/i.test(text);
}

function isCasualWeatherQuestion(text) {
  return /天气|天儿|天冷|天热|下雨|降温|升温|风大|空气|穿什么|出门/.test(text)
    && !/热风险|高温风险|设施|候选点|选址|缺口|覆盖|人群|道路|路段|片区/.test(text);
}

function isPlanningRelated(text) {
  return includesAny(text, PLANNING_KEYWORDS);
}

function makeWeatherUserReply(weather) {
  if (weather?.status === "ready") {
    const temperature = Number.isFinite(weather.temperature) ? `${Math.round(weather.temperature)}°C` : "温度待确认";
    const apparent = Number.isFinite(weather.apparent) ? `体感约 ${Math.round(weather.apparent)}°C` : "体感温度待确认";
    const humidity = Number.isFinite(weather.humidity) ? `湿度约 ${Math.round(weather.humidity)}%` : "湿度待确认";
    const wind = Number.isFinite(weather.wind) ? `风速约 ${Math.round(weather.wind)} km/h` : "风速待确认";
    const summary = weather.summary ? `，天气为${weather.summary}` : "";
    return `当前主页面天气浮层显示：海淀区约 ${temperature}${summary}，${apparent}，${humidity}，${wind}。如果你是想判断今天是否需要加强临时清凉设施，我可以继续把天气、高温风险、暴露人群和候选点一起看。`;
  }
  if (weather?.status === "error") {
    return "我能回答天气类问题，但当前实时天气接口暂不可用，所以不能可靠报出温度或降雨。主页面地图上方的天气浮层恢复后会显示海淀实时天气；如果你要做规划判断，我可以先按高温风险、暴露人群和候选设施数据继续分析。";
  }
  return "我能回答天气类问题，当前正在获取海淀实时天气。你可以稍后看地图上方天气浮层；如果你要判断是否需要临时清凉点，我也可以先结合高温风险和设施缺口数据给出规划建议。";
}

function makePlanningKnowledgeReply(text) {
  if (/公平|老人|老年|儿童|学生|接送|弱势/.test(text)) {
    return "公平优先的核心不是让设施覆盖人数最大，而是优先补足高风险、服务不足且弱势人群集中的区域。这个项目里会重点看老人、儿童接送家庭、户外劳动者等暴露人群，再叠加高温风险、设施缺口和步行可达改善，避免只把设施投向人口最多或最容易建设的地方。";
  }
  if (/缺口|覆盖|可达|服务不足/.test(text)) {
    return "设施缺口可以理解为“有高温暴露需求，但现有清凉设施服务不到或服务不足”的空间区域。当前项目会综合现有设施覆盖、步行可达、需求权重、热风险道路和活动暴露记录来判断。具体地点问题会优先查地图事实；如果地图未命中，我会明确说明不能判断。";
  }
  if (/候选点|选址|点位|布点/.test(text)) {
    return "候选点推荐不是只找空地，而是把高温风险、服务缺口、覆盖人群、步行改善、可复用设施、实施可行性和人工核验事项一起排序。推荐结果应作为规划讨论依据，最终还要核验权属、消防、道路红线、开放时间和运维责任。";
  }
  if (/步行|可达|距离/.test(text)) {
    return "步行可达性用于判断居民或重点人群能否在合理时间内到达清凉设施。高温场景下，距离越远，老年人、儿童和户外劳动者的实际可达性越差，因此候选点排序会关注步行距离改善，而不是只看直线距离。";
  }
  if (/热风险|高温风险|热压力/.test(text)) {
    return "热风险不是单一温度值，而是道路热压力、遮阴、水体距离、活动暴露和重点人群分布共同形成的风险判断。空间回答会优先使用地图中的道路热风险和缺口热点数据，不会凭空给某条路定级。";
  }
  return "这个问题属于高温设施规划的方法解释。我的判断逻辑是：先识别高温风险和重点暴露人群，再核验现有设施覆盖和步行可达，随后识别设施缺口、生成候选点，并在公平、效率、低成本、应急等策略下做方案比选。具体地点或道路问题会优先查询地图数据。";
}

export function analyzeAgentIntent({ input, agentState, fallbackStrategy = "公平优先", weather = null, intentRoute = null }) {
  const rawUserInput = input.trim();
  const compactText = rawUserInput.replace(/\s+/g, "");
  const route = intentRoute ?? routeAgentIntent({ input });

  if (route.routeId === INTENT_ROUTES.EMPTY) {
    return {
      isPlanningRelated: false,
      responseType: "empty",
      intentRoute: route,
      taskType: null,
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: null, strategy: null, constraints: [] },
      userReply: "可以直接输入一个高温治理目标，例如：某某街应该怎么治理，或哪里最缺清凉设施。",
      nextActions: ["输入治理目标"],
    };
  }

  if (route.routeId === INTENT_ROUTES.DATE) {
    return {
      isPlanningRelated: false,
      responseType: "general_answer",
      intentRoute: route,
      taskType: null,
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: null, strategy: null, constraints: [] },
      userReply: `今天是 ${formatToday()}。如果你要继续做高温设施规划，我也可以接着帮你看某个片区、道路或候选点。`,
      nextActions: ["继续提问", "查看候选点"],
    };
  }

  if (route.routeId === INTENT_ROUTES.CASUAL_WEATHER) {
    return {
      isPlanningRelated: false,
      responseType: "casual_answer",
      intentRoute: route,
      taskType: null,
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: null, strategy: null, constraints: [] },
      userReply: makeWeatherUserReply(weather),
      nextActions: ["继续聊天气", "查看高温风险", "判断临时清凉点"],
    };
  }

  if (route.routeId === INTENT_ROUTES.CAPABILITY) {
    return {
      isPlanningRelated: false,
      responseType: "capability_answer",
      intentRoute: route,
      taskType: null,
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: null, strategy: null, constraints: [] },
      userReply: "我在。你可以把我当成一个高温设施规划助理：普通问题我可以正常聊；涉及地点、道路、设施缺口、候选点或方案比选的问题，我会优先查地图和 RAG 数据，再给出有证据的回答。",
      nextActions: ["继续提问", "提出治理目标"],
    };
  }

  if (!route.isPlanningRelated && route.routeId === INTENT_ROUTES.GENERAL_CHAT) {
    return {
      isPlanningRelated: false,
      responseType: "general_answer",
      intentRoute: route,
      taskType: null,
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: null, strategy: null, constraints: [] },
      userReply: "这个问题我可以先按普通问答来聊，不会强行套用规划流程。你也可以继续追问；如果话题转到高温风险、清凉设施、候选点或方案比选，我会切回地图数据和规划证据来回答。",
      nextActions: ["继续提问", "切换到规划问题"],
    };
  }

  if (route.routeId === INTENT_ROUTES.PLANNING_KNOWLEDGE) {
    return {
      isPlanningRelated: true,
      responseType: "planning_knowledge",
      intentRoute: route,
      taskType: "goal_understanding",
      taskTypeLabel: "规划方法解释",
      shouldRunWorkflow: false,
      intent: { rawUserInput, parsedGoal: null, targetGroups: [], planningObject: "清凉设施", strategy: fallbackStrategy, constraints: [] },
      userReply: makePlanningKnowledgeReply(compactText),
      nextActions: ["继续追问方法", "查询具体地点", "生成候选点"],
    };
  }

  const taskType = deriveTaskType(compactText);
  const targetGroups = deriveTargetGroups(compactText);
  const strategy = deriveStrategy(compactText, fallbackStrategy);
  const constraints = deriveConstraints(compactText);
  const planningObject = derivePlanningObject(compactText);
  const missingPreconditions = listMissingPreconditions(agentState, taskType);
  const needsClarification = taskType === "goal_understanding";
  const isCandidateQuestion = isCandidateDataQuestion(compactText);
  const areaFactsReply = isAreaFactQuestion(compactText)
    ? "这个问题需要查询地图缺口图层和道路热风险图层。我会优先从片区空间事实中判断是否存在设施缺口；如果当前开发代理未启动，则只能先展示候选点清单，不能断言该片区没有缺口。"
    : null;
  const dataAwareReply = areaFactsReply ?? (isCandidateQuestion
    ? makeCandidateDataReply(compactText, agentState)
    : isRoadRiskDataQuestion(compactText)
      ? makeRoadRiskDataReply(compactText)
      : null);

  return {
    isPlanningRelated: true,
    responseType: needsClarification ? "clarification" : "workflow_plan",
    intentRoute: route,
    taskType,
    taskTypeLabel: TASK_LABELS[taskType],
    shouldRunWorkflow: !needsClarification,
    intent: {
      rawUserInput,
      parsedGoal: needsClarification ? null : rawUserInput,
      targetGroups,
      planningObject,
      strategy,
      outputType: taskType === "report_generation" ? "审议材料" : "规划方案",
      constraints,
    },
    missingPreconditions,
    userReply: dataAwareReply ?? makeUserReply({ taskType, needsClarification, targetGroups, planningObject, strategy, constraints, missingPreconditions }),
    nextActions: needsClarification ? ["补充研究区", "说明设施目标"] : ["生成任务图", "检查前置条件", "执行规划任务"],
  };
}

function summarizeAgentState(agentState) {
  const candidateSites = getCandidatePool(agentState);
  const facilityGaps = getFacilityGaps(agentState);
  const highRiskZones = getHighRiskZones(agentState);
  const facilityAudit = agentState?.facilityAudit ?? realAgentData.facilityAudit ?? {};
  const diagnosis = agentState?.diagnosis ?? realAgentData.diagnosis ?? {};

  return {
    dataSource: agentState?.meta?.mode ?? realAgentData.meta?.mode ?? "local-real",
    studyArea: agentState?.project?.studyArea ?? realAgentData.meta?.studyArea ?? "海淀区",
    hasRiskDiagnosis: Boolean(highRiskZones.length || diagnosis.priorityCells?.length),
    hasPopulationExposure: Boolean(diagnosis.exposedPopulation || diagnosis.activityHotspots?.length),
    hasFacilityAudit: Boolean(facilityAudit.existingFacilities?.length || facilityAudit.coverageRate),
    hasFacilityGaps: Boolean(facilityGaps.length || facilityAudit.candidateSearchArea?.length),
    hasCandidateSites: Boolean(candidateSites.length),
    hasScenarios: Boolean(agentState?.scenarios && Object.keys(agentState.scenarios).length),
    exposedPopulation: diagnosis.exposedPopulation ?? null,
    coverageRate: facilityAudit.coverageRate ?? null,
    uncoveredPopulation: facilityAudit.uncoveredPopulation ?? null,
    avgWalkDistance: facilityAudit.avgWalkDistance ?? null,
    topCandidateSite: candidateSites[0]?.locationName ?? null,
    existingFacilities: (facilityAudit.existingFacilities ?? []).slice(0, 12).map((facility) => ({
      id: facility.id,
      name: facility.name,
      type: facility.type,
      readiness: facility.readiness,
      coordinates: facility.coordinates,
    })),
    candidateSites: candidateSites.slice(0, 10).map((site) => ({
      siteId: site.siteId,
      locationName: site.locationName,
      priority: site.priority,
      score: site.score,
      coveredPopulation: site.coveredPopulation,
      walkDistanceImprovement: site.walkDistanceImprovement,
      riskLevel: site.riskLevel,
      feasibility: site.feasibility,
      evidence: (site.evidence ?? []).slice(0, 3),
      manualCheck: (site.manualCheck ?? []).slice(0, 3),
    })),
    facilityGaps: facilityGaps.slice(0, 6),
    highRiskZones: highRiskZones.slice(0, 8).map((zone) => ({
      zoneId: zone.zoneId,
      name: zone.name,
      riskLevel: zone.riskLevel,
      demandWeight: zone.demandWeight,
      reason: zone.reason,
    })),
  };
}

function normalizeIntentResult(remoteResult, fallbackResult, intentRoute = fallbackResult.intentRoute) {
  if (!remoteResult || typeof remoteResult !== "object") return fallbackResult;
  const areaFactsReply = formatAreaFactsReply(remoteResult.areaPlanningFacts);
  const taskType = remoteResult.taskType && Object.prototype.hasOwnProperty.call(TASK_LABELS, remoteResult.taskType)
    ? remoteResult.taskType
    : fallbackResult.taskType;
  const isPlanningRelated = intentRoute?.isPlanningRelated ? Boolean(remoteResult.isPlanningRelated || fallbackResult.isPlanningRelated) : false;
  const shouldUseAreaFactsReply = Boolean(isPlanningRelated && intentRoute?.shouldUseMapFacts !== false);
  const intent = remoteResult.intent && typeof remoteResult.intent === "object" ? remoteResult.intent : {};

  return {
    ...fallbackResult,
    ...remoteResult,
    isPlanningRelated,
    intentRoute,
    taskType,
    taskTypeLabel: taskType ? (remoteResult.taskTypeLabel || TASK_LABELS[taskType]) : null,
    shouldRunWorkflow: Boolean(isPlanningRelated && remoteResult.shouldRunWorkflow),
    intent: {
      ...fallbackResult.intent,
      ...intent,
      targetGroups: Array.isArray(intent.targetGroups) ? intent.targetGroups : fallbackResult.intent.targetGroups,
      constraints: Array.isArray(intent.constraints) ? intent.constraints : fallbackResult.intent.constraints,
    },
    missingPreconditions: Array.isArray(remoteResult.missingPreconditions)
      ? remoteResult.missingPreconditions
      : fallbackResult.missingPreconditions,
    nextActions: Array.isArray(remoteResult.nextActions) ? remoteResult.nextActions : fallbackResult.nextActions,
    areaPlanningFacts: remoteResult.areaPlanningFacts ?? fallbackResult.areaPlanningFacts,
    userReply: (shouldUseAreaFactsReply && areaFactsReply)
      ? areaFactsReply
      : (typeof remoteResult.userReply === "string" && remoteResult.userReply.trim()
      ? remoteResult.userReply
      : fallbackResult.userReply),
  };
}

async function enrichFallbackWithMapFacts({ input, agentState, fallbackResult, intentRoute = fallbackResult.intentRoute }) {
  if (!intentRoute?.shouldUseMapFacts && intentRoute?.routeId !== INTENT_ROUTES.MAP_FACT) return fallbackResult;
  if (!fallbackResult.isPlanningRelated) return fallbackResult;
  if (!isAreaFactQuestion(input)) return fallbackResult;

  try {
    const baseUrl = import.meta?.env?.BASE_URL ?? "./";
    const response = await fetch(`${baseUrl}data/showcase.json`);
    if (!response.ok) return fallbackResult;

    const showcaseData = await response.json();
    const placeIndexResponse = await fetch(`${baseUrl}data/place-index.json`);
    const placeIndex = placeIndexResponse.ok ? await placeIndexResponse.json() : null;
    const areaPlanningFacts = queryAreaPlanningFacts({
      input,
      showcaseData,
      placeIndex,
      candidateSites: getCandidatePool(agentState),
      existingFacilities: agentState?.facilityAudit?.existingFacilities ?? realAgentData.facilityAudit?.existingFacilities ?? [],
    });
    const mapReply = formatAreaFactsReply(areaPlanningFacts);
    if (!mapReply) return fallbackResult;

    return {
      ...fallbackResult,
      isPlanningRelated: true,
      intentRoute,
      responseType: "map_fact_answer",
      taskType: fallbackResult.taskType ?? "facility_gap_analysis",
      taskTypeLabel: fallbackResult.taskTypeLabel ?? TASK_LABELS.facility_gap_analysis,
      shouldRunWorkflow: false,
      areaPlanningFacts,
      userReply: mapReply,
      nextActions: areaPlanningFacts.hasFacilityGap && !areaPlanningFacts.hasCandidateSites
        ? ["重新生成候选点", "检查空间约束", "人工核验缺口"]
        : ["查看地图证据", "调整约束", "生成审议材料"],
    };
  } catch {
    return fallbackResult;
  }
}

async function enrichFallbackWithSpatialRag({ input, agentState, fallbackResult, ragMemory = null, intentRoute = fallbackResult.intentRoute }) {
  if (!intentRoute?.shouldUseSpatialRag) return fallbackResult;
  if (!isSpatialRagCandidate(input)) return fallbackResult;

  try {
    const baseUrl = import.meta?.env?.BASE_URL ?? "./";
    const response = await fetch(`${baseUrl}data/showcase.json`);
    if (!response.ok) return fallbackResult;

    const showcaseData = await response.json();
    const placeIndexResponse = await fetch(`${baseUrl}data/place-index.json`);
    const placeIndex = placeIndexResponse.ok ? await placeIndexResponse.json() : null;
    const spatialRag = runSpatialRag({
      input,
      agentState,
      showcaseData,
      placeIndex,
      previousRagMemory: ragMemory,
    });

    if (!spatialRag.handled) return fallbackResult;

    return {
      ...fallbackResult,
      isPlanningRelated: true,
      intentRoute,
      responseType: "spatial_rag_answer",
      taskType: fallbackResult.taskType ?? "facility_gap_analysis",
      taskTypeLabel: spatialRag.query?.label ?? fallbackResult.taskTypeLabel ?? TASK_LABELS.facility_gap_analysis,
      shouldRunWorkflow: false,
      userReply: spatialRag.answer.text,
      nextActions: spatialRag.evidencePackage?.answerMode === "ranking"
        ? ["继续查看缺口排行", "查看地图证据", "生成候选点"]
        : spatialRag.evidencePackage?.answerMode === "candidate_site_lookup"
          ? ["查看候选点", "调整约束", "人工核验"]
          : ["查看地图证据", "调整约束", "生成审议材料"],
      spatialRag,
      ragMemory: spatialRag.ragMemory,
      areaPlanningFacts: spatialRag.evidencePackage?.areaFacts ?? fallbackResult.areaPlanningFacts,
    };
  } catch {
    return fallbackResult;
  }
}

export async function analyzeAgentIntentWithLLM({ input, agentState, fallbackStrategy = "公平优先", ragMemory = null, projectMemory = null, weather = null }) {
  const intentRoute = routeAgentIntent({ input, ragMemory });
  const fallbackResult = analyzeAgentIntent({ input, agentState, fallbackStrategy, weather, intentRoute });
  if (!intentRoute.shouldUseLlm && !intentRoute.shouldUseSpatialRag && !intentRoute.shouldUseMapFacts) return fallbackResult;

  const ragResult = await enrichFallbackWithSpatialRag({ input, agentState, fallbackResult, ragMemory, intentRoute });
  if (ragResult.responseType === "spatial_rag_answer") return ragResult;

  const mapFactsResult = await enrichFallbackWithMapFacts({ input, agentState, fallbackResult, intentRoute });
  if (mapFactsResult.responseType === "map_fact_answer") return mapFactsResult;
  if (!intentRoute.shouldUseLlm) return mapFactsResult;

  try {
    const response = await fetch("/api/agent/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        fallbackStrategy,
        clientRoute: intentRoute,
        agentStateSummary: summarizeAgentState(agentState),
        projectMemory,
      }),
    });

    if (!response.ok) return mapFactsResult;
    const remoteResult = await response.json();
    return normalizeIntentResult(remoteResult, fallbackResult, intentRoute);
  } catch {
    return mapFactsResult;
  }
}

function makeUserReply({ taskType, needsClarification, targetGroups, planningObject, strategy, constraints, missingPreconditions }) {
  if (needsClarification) {
    return "我判断这是高温治理相关问题，但目标还不够明确。请补充研究区、希望服务的人群，以及想新增或核验的设施类型。";
  }

  const taskLabel = TASK_LABELS[taskType] ?? "规划任务";
  const preconditionText = missingPreconditions.length
    ? `当前缺少${missingPreconditions.join("、")}，我会先补齐前置分析，再进入${taskLabel}。`
    : `前置结果已具备，可以进入${taskLabel}。`;
  const constraintText = constraints.length ? `已识别约束：${constraints.join("、")}。` : "暂未识别新增约束。";

  return `我已识别为“${taskLabel}”。目标人群为${targetGroups.join("、")}，规划对象为${planningObject}，策略偏好为${strategy}。${constraintText}${preconditionText}`;
}

export function buildAgentMemoryFromIntent(intentResult, previousMemory = {}) {
  const intent = intentResult.intent ?? {};
  return {
    rawInput: intent.rawUserInput,
    taskType: intentResult.taskTypeLabel ?? "目标理解",
    targetArea: "海淀区",
    targetGroups: (intent.targetGroups ?? []).join("、") || "重点暴露人群",
    planningObject: intent.planningObject ?? "清凉设施",
    strategy: intent.strategy ?? previousMemory.strategy ?? "公平优先",
    summary: intentResult.userReply,
    affectedSteps: intentResult.missingPreconditions?.length
      ? `需补齐：${intentResult.missingPreconditions.join("、")}`
      : "目标理解、前置检查、任务图生成、工具执行",
  };
}

export function makeAgentMessageFromIntent(intentResult, agentState) {
  const topSite = agentState?.candidateSites?.[0]?.locationName;
  const chips = intentResult.isPlanningRelated
    ? [intentResult.taskTypeLabel ?? "目标理解", intentResult.intent?.strategy ?? "公平优先"].filter(Boolean)
    : [intentResult.responseType === "casual_answer" ? "普通聊天" : "普通问答"];

  const suffix = intentResult.isPlanningRelated && topSite && intentResult.responseType !== "spatial_rag_answer"
    ? ` 当前已有候选点数据可复用，首个候选点为“${topSite}”。`
    : "";

  return {
    role: "assistant",
    title: intentResult.isPlanningRelated
      ? (intentResult.taskTypeLabel ?? "目标理解")
      : intentResult.responseType === "capability_answer"
        ? "我能帮什么"
        : "普通问答",
    text: `${intentResult.userReply}${suffix}`,
    chips,
  };
}
