import { isSpatialRagCandidate } from "./spatialRag.js";

export const INTENT_ROUTES = {
  EMPTY: "empty",
  DATE: "date",
  CASUAL_WEATHER: "casual_weather",
  CAPABILITY: "capability",
  SPATIAL_RAG: "spatial_rag",
  MAP_FACT: "map_fact",
  PLANNING_KNOWLEDGE: "planning_knowledge",
  PLANNING_WORKFLOW: "planning_workflow",
  GENERAL_CHAT: "general_chat",
};

const WEATHER_RE = /天气|天儿|天冷|天热|下雨|降温|升温|风大|空气|穿什么|出门/;
const DATE_RE = /今天几|今天是几|今天日期|今天星期|几号|日期/;
const CAPABILITY_RE = /你是谁|你能做什么|怎么用|可以做什么|帮助/;
const GREETING_RE = /^(你好|您好|hello|hi|嗨|在吗)[。！？!?\s]*$/i;
const FOLLOW_UP_RE = /除此之外|还有呢|还有吗|还有哪些|继续|更多|再说|别的/;

const PLANNING_TOPIC_RE = /高温风险|热风险|设施|候选点|选址|缺口|覆盖|人群|道路|路段|片区|清凉|遮阴|饮水|休憩|驿站|避暑|可达|步行|方案|比选|公平|效率|成本|应急|约束|治理|街道|社区|公园|公交|老人|老年|儿童|学生|接送|家庭|户外|劳动|弱势|暴露|优先|保障/;
const MAP_FACT_RE = /附近|周边|道路|路|街|社区|学校|医院|公园|地铁站|公交站|候选点|点位|设施|缺口|覆盖|热风险|风险等级|存在|有没有|是否|治理|哪里|哪些/;
const PLANNING_KNOWLEDGE_RE = /为什么|怎么计算|怎么算|计算方法|评估方法|依据|逻辑|原理|指标|什么意思|如何评估/;

export function normalizeAgentInput(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function makeRoute(routeId, overrides = {}) {
  return {
    routeId,
    isPlanningRelated: false,
    responseType: routeId,
    shouldUseSpatialRag: false,
    shouldUseMapFacts: false,
    shouldUseLlm: false,
    shouldRunWorkflow: false,
    reason: "",
    ...overrides,
  };
}

export function routeAgentIntent({ input, ragMemory = null } = {}) {
  const text = normalizeAgentInput(input);

  if (!text) {
    return makeRoute(INTENT_ROUTES.EMPTY, {
      responseType: "empty",
      reason: "empty_input",
    });
  }

  if (DATE_RE.test(text)) {
    return makeRoute(INTENT_ROUTES.DATE, {
      responseType: "general_answer",
      reason: "date_question",
    });
  }

  if (WEATHER_RE.test(text) && !PLANNING_TOPIC_RE.test(text)) {
    return makeRoute(INTENT_ROUTES.CASUAL_WEATHER, {
      responseType: "casual_answer",
      reason: "casual_weather_without_planning_topic",
    });
  }

  if (GREETING_RE.test(text) || CAPABILITY_RE.test(text)) {
    return makeRoute(INTENT_ROUTES.CAPABILITY, {
      responseType: "capability_answer",
      reason: GREETING_RE.test(text) ? "greeting" : "capability_question",
    });
  }

  if (FOLLOW_UP_RE.test(text)) {
    return makeRoute(INTENT_ROUTES.SPATIAL_RAG, {
      isPlanningRelated: Boolean(ragMemory?.lastResults?.length),
      responseType: "spatial_follow_up",
      shouldUseSpatialRag: true,
      reason: ragMemory?.lastResults?.length ? "spatial_follow_up_with_memory" : "spatial_follow_up_without_memory",
    });
  }

  if (PLANNING_TOPIC_RE.test(text) && PLANNING_KNOWLEDGE_RE.test(text) && !/附近|周边|哪里|哪儿|哪些|有没有|是否|存在|比较|哪个更|排行|排序|最缺|最大|最高/.test(text)) {
    return makeRoute(INTENT_ROUTES.PLANNING_KNOWLEDGE, {
      isPlanningRelated: true,
      responseType: "planning_knowledge",
      shouldUseLlm: false,
      shouldRunWorkflow: false,
      reason: "planning_method_or_concept_question",
    });
  }

  if (isSpatialRagCandidate(text)) {
    return makeRoute(INTENT_ROUTES.SPATIAL_RAG, {
      isPlanningRelated: true,
      responseType: "spatial_rag_candidate",
      shouldUseSpatialRag: true,
      reason: "spatial_keyword_or_place_query",
    });
  }

  if (PLANNING_TOPIC_RE.test(text)) {
    if (PLANNING_KNOWLEDGE_RE.test(text) && !MAP_FACT_RE.test(text)) {
      return makeRoute(INTENT_ROUTES.PLANNING_KNOWLEDGE, {
        isPlanningRelated: true,
        responseType: "planning_knowledge",
        shouldUseLlm: false,
        shouldRunWorkflow: false,
        reason: "planning_method_or_concept_question",
      });
    }
    const shouldUseMapFacts = MAP_FACT_RE.test(text);
    return makeRoute(shouldUseMapFacts ? INTENT_ROUTES.MAP_FACT : INTENT_ROUTES.PLANNING_WORKFLOW, {
      isPlanningRelated: true,
      responseType: shouldUseMapFacts ? "map_fact_candidate" : "planning_workflow",
      shouldUseMapFacts,
      shouldUseLlm: true,
      shouldRunWorkflow: !shouldUseMapFacts,
      reason: shouldUseMapFacts ? "planning_map_fact_question" : "planning_workflow_question",
    });
  }

  return makeRoute(INTENT_ROUTES.GENERAL_CHAT, {
    responseType: "general_answer",
    shouldUseLlm: true,
    reason: "non_planning_general_chat",
  });
}
