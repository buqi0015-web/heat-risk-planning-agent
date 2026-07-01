const timestamp = () => new Date().toISOString();

const MAX_RECENT_TURNS = 10;
const MAX_PROCESS_EVENTS = 20;
const MAX_EVIDENCE_EVENTS = 12;

function compactArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter(Boolean) : fallback;
}

function uniqueList(items) {
  return Array.from(new Set(compactArray(items).map((item) => String(item).trim()).filter(Boolean)));
}

function candidateIds(agentState) {
  return compactArray(agentState?.candidateSites)
    .map((site) => site.siteId ?? site.id)
    .filter(Boolean)
    .slice(0, 30);
}

function getStudyArea(agentState) {
  return agentState?.project?.studyArea ?? "北京市海淀区";
}

function getTargetGroups(agentState, seedMemory) {
  const fromState = compactArray(agentState?.intent?.targetGroups);
  if (fromState.length) return fromState;
  const fromMemory = String(seedMemory?.targetGroups ?? "")
    .split(/、|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
  return fromMemory.length ? fromMemory : ["重点暴露人群"];
}

function getPlanningObject(agentState, seedMemory) {
  return agentState?.intent?.planningObject
    ?? seedMemory?.planningObject
    ?? "清凉设施";
}

function getConstraints(agentState) {
  return uniqueList([
    ...(agentState?.project?.constraints ?? []),
    ...(agentState?.intent?.constraints ?? []),
  ]);
}

function getWorkflowEvents(agentState) {
  return compactArray(agentState?.workflow?.versionHistory)
    .map((entry) => ({
      type: "version",
      source: "AgentState",
      version: entry.version,
      summary: entry.summary,
      createdAt: entry.time,
    }))
    .slice(-MAX_PROCESS_EVENTS);
}

export function createProjectMemory({
  agentState,
  seedMemory,
  scenarioDate,
  version,
  strategy,
} = {}) {
  const createdAt = timestamp();
  return {
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    conversation: {
      latestInput: seedMemory?.rawInput ?? agentState?.intent?.rawUserInput ?? "",
      latestRoute: null,
      turns: [],
    },
    project: {
      studyArea: getStudyArea(agentState),
      scenarioDate: scenarioDate ?? agentState?.project?.scenarioDate ?? null,
      currentGoal: seedMemory?.rawInput ?? agentState?.agent?.currentGoal ?? agentState?.intent?.rawUserInput ?? "",
      targetGroups: getTargetGroups(agentState, seedMemory),
      planningObject: getPlanningObject(agentState, seedMemory),
      strategy: strategy ?? seedMemory?.strategy ?? agentState?.intent?.strategy ?? "公平优先",
      constraints: getConstraints(agentState),
      activeVersion: version ?? agentState?.workflow?.versionHistory?.at?.(-1)?.version ?? "方案 v2.1",
      selectedScenario: agentState?.report?.selectedPlan ?? "fairnessFirst",
      selectedSiteId: null,
      candidateSiteIds: candidateIds(agentState),
    },
    process: {
      taskGraph: agentState?.workflow?.taskGraph ?? null,
      reviewedTaskGraph: agentState?.workflow?.reviewedTaskGraph ?? null,
      toolCallHistory: compactArray(agentState?.workflow?.toolCallHistory).slice(-MAX_PROCESS_EVENTS),
      versionHistory: compactArray(agentState?.workflow?.versionHistory).slice(-MAX_PROCESS_EVENTS),
      events: getWorkflowEvents(agentState),
      recalculationHints: [],
    },
    evidence: {
      ragMemory: null,
      lastSpatialQuery: null,
      retrievedLayers: [],
      matchedEntities: {},
      manualCheck: compactArray(agentState?.report?.manualChecklist),
      events: [],
    },
  };
}

function appendLimited(list, item, limit) {
  return [...compactArray(list), item].slice(-limit);
}

function makeConversationTurn({ userInput, assistantMessage, intentResult }) {
  return {
    id: `turn-${Date.now()}`,
    createdAt: timestamp(),
    userInput,
    assistantTitle: assistantMessage?.title ?? null,
    assistantText: assistantMessage?.text ?? intentResult?.userReply ?? "",
    routeId: intentResult?.intentRoute?.routeId ?? null,
    responseType: intentResult?.responseType ?? null,
    isPlanningRelated: Boolean(intentResult?.isPlanningRelated),
    writesProjectState: Boolean(intentResult?.isPlanningRelated && intentResult?.shouldRunWorkflow),
  };
}

function buildProcessEvent({ userInput, intentResult, uiState }) {
  return {
    type: intentResult?.shouldRunWorkflow ? "workflow_intent" : "conversation",
    source: intentResult?.responseType ?? "agent",
    createdAt: timestamp(),
    input: userInput,
    routeId: intentResult?.intentRoute?.routeId ?? null,
    taskType: intentResult?.taskType ?? null,
    taskTypeLabel: intentResult?.taskTypeLabel ?? null,
    activeVersion: uiState?.version ?? null,
    selectedScenario: uiState?.scenario ?? null,
    affectedSteps: compactArray(intentResult?.missingPreconditions).length
      ? `需补齐：${intentResult.missingPreconditions.join("、")}`
      : intentResult?.shouldRunWorkflow
        ? "目标理解、前置检查、任务图生成、工具执行"
        : "不写入规划工作流",
  };
}

function buildEvidenceEvent({ userInput, intentResult }) {
  const rag = intentResult?.spatialRag;
  if (!rag) return null;
  return {
    type: "spatial_rag",
    createdAt: timestamp(),
    input: userInput,
    queryType: rag.query?.queryType ?? null,
    queryLabel: rag.query?.label ?? null,
    spatialScope: rag.evidencePackage?.spatialScope ?? null,
    retrievedLayers: rag.evidencePackage?.retrievedLayers ?? [],
    matchedEntities: rag.evidencePackage?.matchedEntities ?? {},
    rankingSignals: rag.evidencePackage?.rankingSignals ?? null,
    resultCount: rag.evidencePackage?.evidence?.length ?? 0,
    dataBoundary: rag.evidencePackage?.dataBoundary ?? null,
  };
}

function updateProjectSlice(currentProject, intentResult, uiState) {
  if (!intentResult?.isPlanningRelated || !intentResult?.shouldRunWorkflow) {
    return {
      ...currentProject,
      activeVersion: uiState?.version ?? currentProject.activeVersion,
      scenarioDate: uiState?.scenarioDate ?? currentProject.scenarioDate,
      selectedScenario: uiState?.scenario ?? currentProject.selectedScenario,
      selectedSiteId: uiState?.selectedSite ?? currentProject.selectedSiteId,
    };
  }

  const intent = intentResult.intent ?? {};
  return {
    ...currentProject,
    currentGoal: intent.rawUserInput ?? currentProject.currentGoal,
    targetGroups: compactArray(intent.targetGroups, currentProject.targetGroups).length
      ? compactArray(intent.targetGroups, currentProject.targetGroups)
      : currentProject.targetGroups,
    planningObject: intent.planningObject ?? currentProject.planningObject,
    strategy: intent.strategy ?? currentProject.strategy,
    constraints: uniqueList([...(currentProject.constraints ?? []), ...(intent.constraints ?? [])]),
    activeVersion: uiState?.version ?? currentProject.activeVersion,
    scenarioDate: uiState?.scenarioDate ?? currentProject.scenarioDate,
    selectedScenario: uiState?.scenario ?? currentProject.selectedScenario,
    selectedSiteId: uiState?.selectedSite ?? currentProject.selectedSiteId,
    candidateSiteIds: compactArray(uiState?.candidateSites)
      .map((site) => site.siteId ?? site.id)
      .filter(Boolean)
      .slice(0, 30),
  };
}

function updateRecalculationHints(currentHints, intentResult) {
  if (intentResult?.taskType !== "constraint_revision") return currentHints ?? [];
  const constraints = compactArray(intentResult?.intent?.constraints);
  return appendLimited(currentHints, {
    createdAt: timestamp(),
    reason: "用户新增或调整空间约束",
    constraints,
    reusableResults: ["高温风险诊断", "重点人群暴露", "现有设施覆盖"],
    recomputeFrom: "候选点生成",
    affectedSteps: ["空间约束检查", "点位排序", "方案比选", "报告摘要"],
  }, 8);
}

export function updateProjectMemory({
  currentMemory,
  userInput,
  assistantMessage,
  intentResult,
  agentState,
  uiState,
} = {}) {
  const base = currentMemory ?? createProjectMemory({ agentState });
  const now = timestamp();
  const turn = makeConversationTurn({ userInput, assistantMessage, intentResult });
  const processEvent = buildProcessEvent({ userInput, intentResult, uiState });
  const evidenceEvent = buildEvidenceEvent({ userInput, intentResult });
  const nextRagMemory = intentResult?.ragMemory ?? base.evidence?.ragMemory ?? null;

  return {
    ...base,
    updatedAt: now,
    conversation: {
      ...base.conversation,
      latestInput: userInput,
      latestRoute: intentResult?.intentRoute ?? base.conversation?.latestRoute ?? null,
      turns: appendLimited(base.conversation?.turns, turn, MAX_RECENT_TURNS),
    },
    project: updateProjectSlice(base.project ?? {}, intentResult, uiState),
    process: {
      ...base.process,
      taskGraph: agentState?.workflow?.taskGraph ?? base.process?.taskGraph ?? null,
      reviewedTaskGraph: agentState?.workflow?.reviewedTaskGraph ?? base.process?.reviewedTaskGraph ?? null,
      toolCallHistory: compactArray(agentState?.workflow?.toolCallHistory, base.process?.toolCallHistory).slice(-MAX_PROCESS_EVENTS),
      versionHistory: compactArray(agentState?.workflow?.versionHistory, base.process?.versionHistory).slice(-MAX_PROCESS_EVENTS),
      events: appendLimited(base.process?.events, processEvent, MAX_PROCESS_EVENTS),
      recalculationHints: updateRecalculationHints(base.process?.recalculationHints, intentResult),
    },
    evidence: {
      ...base.evidence,
      ragMemory: nextRagMemory,
      lastSpatialQuery: intentResult?.spatialRag?.query ?? base.evidence?.lastSpatialQuery ?? null,
      retrievedLayers: intentResult?.spatialRag?.evidencePackage?.retrievedLayers ?? base.evidence?.retrievedLayers ?? [],
      matchedEntities: intentResult?.spatialRag?.evidencePackage?.matchedEntities ?? base.evidence?.matchedEntities ?? {},
      manualCheck: intentResult?.spatialRag?.evidencePackage?.manualCheck ?? base.evidence?.manualCheck ?? [],
      events: evidenceEvent
        ? appendLimited(base.evidence?.events, evidenceEvent, MAX_EVIDENCE_EVENTS)
        : base.evidence?.events ?? [],
    },
  };
}

export function getReusableRagMemory(projectMemory, fallbackRagMemory = null) {
  return projectMemory?.evidence?.ragMemory ?? fallbackRagMemory ?? null;
}

export function makeProjectMemoryBrief(projectMemory) {
  if (!projectMemory) return null;
  const project = projectMemory.project ?? {};
  const process = projectMemory.process ?? {};
  const evidence = projectMemory.evidence ?? {};
  return {
    studyArea: project.studyArea,
    currentGoal: project.currentGoal,
    targetGroups: project.targetGroups ?? [],
    planningObject: project.planningObject,
    strategy: project.strategy,
    constraints: project.constraints ?? [],
    activeVersion: project.activeVersion,
    selectedScenario: project.selectedScenario,
    selectedSiteId: project.selectedSiteId,
    lastRoute: projectMemory.conversation?.latestRoute?.routeId ?? null,
    reusableRagQuery: evidence.ragMemory?.queryLabel ?? evidence.ragMemory?.queryType ?? null,
    retrievedLayers: evidence.retrievedLayers ?? [],
    recalculationHints: process.recalculationHints ?? [],
  };
}
