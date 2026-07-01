import {
  createAgentVersionEntry,
  createInitialAgentState,
  createInitialProjectState as createProjectStateSlice,
  mockCandidateSites,
} from "./agentState.js";
import {
  TaskTypeRegistry,
  ToolRegistry,
  UnknownTaskType,
  WorkflowTemplateRegistry,
} from "./registries.js";

const now = () => new Date().toISOString();

const strategyCopy = {
  equity: {
    label: "公平优先",
    scenarioKey: "fairnessFirst",
    emphasis: "优先保障热脆弱性高、活动刚性强、绕行容忍低的人群。",
    constraints: ["重点人群", "时间刚性", "低绕行", "近学校/医疗点"],
  },
  coverage: {
    label: "覆盖优先",
    scenarioKey: "efficiencyFirst",
    emphasis: "优先扩大高暴露道路和设施盲区的基础服务覆盖。",
    constraints: ["覆盖效率", "道路连续暴露", "服务盲区", "路径中断"],
  },
  reuse: {
    label: "存量复用优先",
    scenarioKey: "lowCostFirst",
    emphasis: "优先改造已有公共设施，降低实施成本并明确运维主体。",
    constraints: ["存量复用", "开放时间", "管理主体", "室内容量"],
  },
  cost: {
    label: "低成本优先",
    scenarioKey: "emergencyFirst",
    emphasis: "优先选择短期可实施、低工程量、易维护的候选点。",
    constraints: ["快速落地", "低工程量", "临时开放", "应急保障"],
  },
};

const taskOutputType = {
  risk_diagnosis: "riskDiagnosis",
  facility_gap_analysis: "facilityGapAnalysis",
  candidate_site_generation: "siteSelectionPlan",
  scenario_comparison: "scenarioComparison",
  constraint_revision: "revisedPlan",
  report_generation: "planningReport",
  goal_understanding: "clarificationRequest",
};

const planningObjectByTask = {
  risk_diagnosis: "高温风险区与暴露人群",
  facility_gap_analysis: "清凉设施服务缺口",
  candidate_site_generation: "清凉设施候选点",
  scenario_comparison: "多策略设施方案",
  constraint_revision: "约束调整后的新版本方案",
  report_generation: "规划审议报告",
  goal_understanding: "待明确的治理目标",
};

const manualCheckToolIds = new Set(["checkSpatialConstraints", "exportPlanningReport"]);

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function tokenizeGoal(goal = "") {
  return goal.replace(/\s+/g, "").toLowerCase();
}

function inferTargetGroups(goal = "", previousGroups = []) {
  const groups = [];
  if (/老人|老年|慢病/.test(goal)) groups.push("慢病老人");
  if (/儿童|孩子|学校|接送学|接送/.test(goal)) groups.push("儿童", "接送学家庭");
  if (/户外|劳动|配送|巡查|保洁/.test(goal)) groups.push("户外劳动者");
  return groups.length ? uniqueItems(groups) : previousGroups;
}

function inferGoalConstraints(goal = "", strategy) {
  const constraints = [...(strategyCopy[strategy]?.constraints ?? [])];
  if (/避开学校|学校门口/.test(goal)) constraints.push("避开学校门口");
  if (/社区服务中心|党群|卫生服务站|公共文化|存量/.test(goal)) constraints.push("优先复用公共服务设施");
  if (/降低成本|低成本|预算/.test(goal)) constraints.push("降低实施成本");
  return uniqueItems(constraints);
}

function makeDynamicStep(baseStep, patch) {
  return { ...baseStep, ...patch, dynamic: true };
}

function normalizeSteps(steps) {
  const seen = new Set();
  return steps
    .filter((step) => step?.id)
    .filter((step) => {
      const key = `${step.id}:${step.toolId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((step, index) => ({
      ...step,
      order: index + 1,
      status: step.status ?? "planned",
      tool: ToolRegistry[step.toolId],
    }));
}

function clonePlanWithSteps(plan, steps, patch = {}) {
  const normalizedSteps = normalizeSteps(steps);
  const taskGraph = buildTaskGraphFromSteps(normalizedSteps, {
    ...plan,
    ...patch,
  });
  return {
    ...plan,
    ...patch,
    steps: normalizedSteps,
    taskGraph,
    requiredTools: uniqueItems(normalizedSteps.map((step) => step.toolId)),
    revisedAt: now(),
  };
}

function toolInputs(toolId) {
  const tool = ToolRegistry[toolId];
  return {
    requiredInputs: tool?.requiredInputs ?? [],
    optionalInputs: tool?.optionalInputs ?? [],
    expectedOutputs: tool?.outputs ?? [],
  };
}

function findToolCandidates(step) {
  const selectedTool = ToolRegistry[step.toolId];
  const outputTokens = new Set([...(selectedTool?.outputs ?? []), step.output].filter(Boolean));
  const candidates = Object.values(ToolRegistry)
    .filter((tool) => tool.toolName === step.toolId
      || tool.outputs?.some((output) => outputTokens.has(output))
      || selectedTool?.nextPossibleTools?.includes(tool.toolName))
    .map((tool) => tool.toolName);

  return uniqueItems([step.toolId, ...candidates]).filter(Boolean);
}

function makeNodeFallbackPlan(step, tool) {
  if (!tool) return "Block this node, insert a manual tool-mapping review node, and keep upstream results unchanged.";
  if (manualCheckToolIds.has(tool.toolName)) return "Keep spatial analysis outputs, request manual verification, then regenerate the report checklist.";
  return `If ${tool.toolName} fails, reuse the latest AgentState memory for this input and trigger Replanner to insert a manual review node before downstream execution.`;
}

function buildTaskGraphFromSteps(steps, planMeta = {}) {
  const baseInputs = new Set([
    "AgentState",
    "studyArea",
    "scenarioDate",
    "facilityType",
    "targetGroups",
    "constraints",
    "strategy",
    "strategyLabel",
    "priorityGroups",
  ]);
  const producers = new Map();
  const nodes = steps.map((step, index) => {
    const tool = ToolRegistry[step.toolId];
    const { requiredInputs, expectedOutputs } = toolInputs(step.toolId);
    const dependsOn = uniqueItems(requiredInputs
      .map((input) => producers.get(input))
      .filter(Boolean));

    const node = {
      stepId: step.id,
      stepName: step.title ?? step.id,
      reason: step.reason ?? `Planner included this node to produce ${step.output ?? "the next planning artifact"} for ${planMeta.taskTypeLabel ?? "the planning task"}.`,
      requiredInputs,
      expectedOutputs,
      toolCandidates: findToolCandidates(step),
      selectedTool: tool?.toolName ?? step.toolId,
      selectionReason: tool
        ? `${tool.displayName} matches the node purpose and returns ${expectedOutputs.join(", ") || "structured outputs"}.`
        : "No registered tool matched this node; Replanner must map a replacement or request manual handling.",
      dependsOn,
      fallbackPlan: makeNodeFallbackPlan(step, tool),
      humanReviewRequired: manualCheckToolIds.has(step.toolId) || /manual|check|review|核验|冲突|报告/.test(`${step.id} ${step.title} ${step.output}`),
      status: step.status === "planned" ? "pending" : (step.status ?? "pending"),
      blockedReason: "",
      needsReviewReason: "",
      sourceStep: step,
      order: step.order ?? index + 1,
    };

    expectedOutputs.forEach((output) => producers.set(output, node.stepId));
    if (!expectedOutputs.length && step.output) producers.set(step.output, node.stepId);
    baseInputs.forEach((input) => {
      if (!producers.has(input)) producers.set(input, null);
    });
    return node;
  });

  const edges = nodes.flatMap((node) => node.dependsOn.map((from) => ({ from, to: node.stepId })));
  return {
    graphId: `${planMeta.planId ?? "task-graph"}-graph`,
    generatedAt: now(),
    nodes,
    edges,
    executionOrder: nodes.map((node) => node.stepId),
    status: "pending",
    reviewIssues: [],
    replannerEvents: [],
  };
}

function cloneTaskGraphWithNodes(taskGraph, nodes, patch = {}) {
  const edges = nodes.flatMap((node) => node.dependsOn.map((from) => ({ from, to: node.stepId })));
  return {
    ...taskGraph,
    ...patch,
    nodes,
    edges,
    executionOrder: nodes.map((node) => node.stepId),
    updatedAt: now(),
  };
}

function annotateTaskGraphWithReview(taskGraph, reviewIssues = []) {
  if (!taskGraph) return taskGraph;
  const nodes = taskGraph.nodes.map((node) => {
    const nodeIssues = reviewIssues.filter((issue) => issue.stepId === node.stepId || issue.fixAction?.includes(node.stepId));
    if (!nodeIssues.length) return node;
    const hasBlocker = nodeIssues.some((issue) => issue.severity === "blocker");
    return {
      ...node,
      status: hasBlocker ? "blocked" : "needs_review",
      blockedReason: hasBlocker ? nodeIssues.map((issue) => issue.message).join(" / ") : node.blockedReason,
      needsReviewReason: nodeIssues.map((issue) => issue.message).join(" / "),
    };
  });

  return cloneTaskGraphWithNodes(taskGraph, nodes, {
    status: reviewIssues.some((issue) => issue.severity === "blocker") ? "blocked" : reviewIssues.length ? "needs_review" : "approved",
    reviewIssues,
  });
}

function templateSteps(templateId) {
  return WorkflowTemplateRegistry[templateId]?.steps ?? [];
}

function hasList(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasDiagnosis(agentState) {
  return hasList(agentState?.diagnosis?.highRiskZones) && hasList(agentState?.diagnosis?.priorityCells);
}

function hasFacilityAudit(agentState) {
  return hasList(agentState?.facilityAudit?.facilityGaps)
    && typeof agentState?.facilityAudit?.coverageRate === "number"
    && typeof agentState?.facilityAudit?.avgWalkDistance === "number";
}

function hasCandidateSites(agentState) {
  return hasList(agentState?.candidateSites);
}

function hasScenarioComparison(agentState) {
  return Boolean(agentState?.report?.comparisonTable) || Boolean(agentState?.scenarios?.fairnessFirst);
}

function getLatestToolOutput(executions, toolName) {
  return [...executions].reverse().find((item) => item.toolName === toolName)?.output;
}

function outputKeysForTool(toolId) {
  return ToolRegistry[toolId]?.outputs ?? [];
}

function initialAvailableInputs(agentState, context) {
  const available = new Set([
    "AgentState",
    "studyArea",
    "scenarioDate",
    "facilityType",
    "targetGroups",
    "constraints",
    "strategy",
    "strategyLabel",
    "priorityGroups",
  ]);

  if (hasDiagnosis(agentState)) {
    available.add("highRiskZones");
    available.add("priorityCells");
  }
  if (hasList(agentState?.diagnosis?.activityHotspots)) available.add("activityHotspots");
  if (hasList(agentState?.facilityAudit?.existingFacilities)) available.add("existingFacilities");
  if (typeof agentState?.facilityAudit?.coverageRate === "number") available.add("coverageRate");
  if (hasList(agentState?.facilityAudit?.uncoveredCells)) available.add("uncoveredCells");
  if (hasList(agentState?.facilityAudit?.facilityGaps)) available.add("facilityGaps");
  if (hasList(agentState?.facilityAudit?.candidateSearchArea)) available.add("candidateSearchArea");
  if (hasList(agentState?.candidateSites)) available.add("candidateSites");
  if (hasList(agentState?.candidateSites)) available.add("rankedSites");
  if (agentState?.scenarios) available.add("scenarios");
  if (context?.targetGroups?.length) available.add("targetGroups");
  if (context?.constraints?.length) available.add("constraints");

  return available;
}

function pushIssue(issues, type, severity, message, stepId, fixAction) {
  issues.push({
    issueId: `${type}-${issues.length + 1}`,
    type,
    severity,
    message,
    stepId,
    fixAction,
  });
}

function moveConstraintChecksAfterCandidateGeneration(steps, agentState, reviewIssues) {
  if (hasCandidateSites(agentState)) return steps;

  const candidateIndex = steps.findIndex((step) => step.toolId === "generateCandidateSites");
  if (candidateIndex < 0) return steps;

  const beforeCandidate = steps.slice(0, candidateIndex);
  const afterCandidate = steps.slice(candidateIndex);
  const prematureConstraintChecks = beforeCandidate.filter((step) => step.toolId === "checkSpatialConstraints");

  if (!prematureConstraintChecks.length) return steps;

  pushIssue(
    reviewIssues,
    "step_order",
    "warning",
    "空间约束检查依赖候选点集合，已自动移动到候选点生成之后。",
    "checkSpatialConstraints",
    "move_after_generateCandidateSites",
  );

  const keptBeforeCandidate = beforeCandidate.filter((step) => step.toolId !== "checkSpatialConstraints");
  const generateStep = afterCandidate[0];
  const remainingAfterCandidate = afterCandidate.slice(1);

  return [
    ...keptBeforeCandidate,
    generateStep,
    ...prematureConstraintChecks,
    ...remainingAfterCandidate,
  ];
}

export function createInitialProjectState() {
  return createProjectStateSlice();
}

export const TaskClassifier = {
  classify(goal, hint) {
    if (hint && TaskTypeRegistry[hint]) {
      const taskType = TaskTypeRegistry[hint];
      return {
        taskType,
        confidence: 1,
        matchedKeywords: ["taskTypeHint"],
        candidateScores: [{ taskTypeId: taskType.id, label: taskType.label, score: 99, matchedKeywords: ["taskTypeHint"] }],
        source: "hint",
      };
    }

    const text = tokenizeGoal(goal);
    const candidateScores = Object.values(TaskTypeRegistry)
      .map((taskType) => {
        const matchedKeywords = taskType.intentKeywords.filter((keyword) => text.includes(keyword.toLowerCase().replace(/\s+/g, "")));
        const typicalQuestionHits = (taskType.typicalQuestions ?? []).filter((question) => {
          const normalizedQuestion = question.toLowerCase().replace(/[？?。.\s]/g, "");
          return normalizedQuestion && text.includes(normalizedQuestion);
        });
        const score = matchedKeywords.length + typicalQuestionHits.length * 2;
        return {
          taskType,
          taskTypeId: taskType.id,
          label: taskType.label,
          score,
          matchedKeywords: uniqueItems([...matchedKeywords, ...typicalQuestionHits]),
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = candidateScores[0];
    if (!best || best.score <= 0) {
      return {
        taskType: UnknownTaskType,
        confidence: 0,
        matchedKeywords: [],
        candidateScores: candidateScores.map(({ taskTypeId, label, score, matchedKeywords }) => ({ taskTypeId, label, score, matchedKeywords })),
        source: "fallback",
      };
    }

    return {
      taskType: best.taskType,
      confidence: Math.min(0.95, 0.45 + best.score * 0.15),
      matchedKeywords: best.matchedKeywords,
      candidateScores: candidateScores.map(({ taskTypeId, label, score, matchedKeywords }) => ({ taskTypeId, label, score, matchedKeywords })),
      source: "keyword",
    };
  },

  infer(goal, hint) {
    return this.classify(goal, hint).taskType;
  },
};

export const PreconditionChecker = {
  check(agentState, taskType) {
    return taskType.requiredData.map((dataKey) => {
      const item = agentState.project.dataInventory[dataKey] ?? {
        label: dataKey,
        status: "missing",
      };
      const severity = item.status === "ready" ? "pass" : item.status === "mock" ? "warning" : "blocker";

      return {
        id: dataKey,
        label: item.label,
        status: item.status,
        severity,
        message: {
          pass: "可直接进入工具链计算。",
          warning: "当前使用 mock 数据，后续可替换为真实接口。",
          blocker: "缺少真实数据，结果需要进入人工核验清单。",
        }[severity],
      };
    });
  },
};

export const Planner = {
  generate({ agentState, goal, strategy = "equity", taskTypeHint }) {
    const classification = TaskClassifier.classify(goal, taskTypeHint);
    const taskType = classification.taskType;
    const targetGroups = inferTargetGroups(goal, agentState.intent?.targetGroups ?? []);
    const constraints = inferGoalConstraints(goal, strategy);
    const outputType = taskOutputType[taskType.id] ?? "siteSelectionPlan";
    const preconditions = PreconditionChecker.check(agentState, taskType);
    const generatedPlan = this.createPlan({
      goal,
      taskType,
      strategy,
      targetGroups,
      constraints,
      outputType,
    });
    return {
      taskType,
      targetGroups,
      constraints,
      outputType,
      preconditions,
      generatedPlan,
      classification,
    };
  },

  createPlan({ goal, taskType, strategy, targetGroups = [], constraints = [], outputType }) {
    const template = WorkflowTemplateRegistry[taskType.defaultTemplateId];
    const strategyMeta = strategyCopy[strategy] ?? strategyCopy.equity;
    const dynamicSteps = [];

    if (targetGroups.length && !template.steps.some((item) => item.id === "people_exposure_analysis")) {
      dynamicSteps.push(makeDynamicStep({
        id: "people_exposure_analysis",
        title: `人群暴露分析：${targetGroups.slice(0, 3).join("、")}`,
        owner: "GIS + Rule",
        toolId: "getPopulationExposure",
        output: "目标人群暴露强度",
      }, {
        reason: "由 targetGroups 触发",
      }));
    }

    if (!taskType.needsClarification && strategy) {
      dynamicSteps.push(makeDynamicStep({
        id: `strategy_sorting_${strategy}`,
        title: `${strategyMeta.label}排序`,
        owner: "Rule",
        toolId: "rankCandidateSites",
        output: "按当前策略调整后的候选点排序结果",
      }, {
        reason: "由 strategy 触发",
      }));
    }

    if (constraints.length && ["candidate_site_generation", "constraint_revision"].includes(taskType.id)) {
      dynamicSteps.push(makeDynamicStep({
        id: "spatial_constraint_check_dynamic",
        title: "空间约束检查",
        owner: "GIS + Rule",
        toolId: "checkSpatialConstraints",
        output: "新增约束下的空间冲突和人工核验项",
      }, {
        reason: "由 constraints 触发",
      }));
    }

    if (outputType === "planningReport" || taskType.id === "report_generation") {
      dynamicSteps.push(makeDynamicStep({
        id: "report_output_dynamic",
        title: "报告输出整理",
        owner: "LLM + Rule",
        toolId: "exportPlanningReport",
        output: "报告结构、证据链和核验清单",
      }, {
        reason: "由 outputType 触发",
      }));
    }

    if (outputType === "scenarioComparison") {
      dynamicSteps.push(makeDynamicStep({
        id: "comparison_table_output_dynamic",
        title: "方案比选表格输出",
        owner: "Rule",
        toolId: "comparePlans",
        output: "多方案对比表、推荐方案和关键权衡",
      }, {
        reason: "由 outputType 触发表格输出",
      }));
    }

    if (["siteSelectionPlan", "revisedPlan"].includes(outputType)) {
      dynamicSteps.push(makeDynamicStep({
        id: "site_plan_output_dynamic",
        title: "候选点清单输出",
        owner: "LLM + Rule",
        toolId: "exportPlanningReport",
        output: "候选点清单、推荐理由和人工核验事项",
      }, {
        reason: "由 outputType 触发结构化方案输出",
      }));
    }

    const stepsWithDynamics = [...(template.steps ?? [])];
    const peopleSteps = dynamicSteps.filter((step) => step.id === "people_exposure_analysis");
    const constraintSteps = dynamicSteps.filter((step) => step.id.includes("spatial_constraint_check"));
    const strategySteps = dynamicSteps.filter((step) => step.id.startsWith("strategy_sorting"));
    const outputSteps = dynamicSteps.filter((step) => step.id.includes("output_dynamic"));

    if (peopleSteps.length) {
      const riskIndex = stepsWithDynamics.findIndex((step) => ["identify_high_risk_units", "overlay_priority_groups"].includes(step.id));
      stepsWithDynamics.splice(riskIndex >= 0 ? riskIndex + 1 : 1, 0, ...peopleSteps);
    }
    if (constraintSteps.length) {
      const insertIndex = stepsWithDynamics.findIndex((step) => step.id === "score_candidate_sites");
      stepsWithDynamics.splice(insertIndex >= 0 ? insertIndex : stepsWithDynamics.length, 0, ...constraintSteps);
    }
    if (strategySteps.length) {
      const insertIndex = stepsWithDynamics.findIndex((step) => ["score_candidate_sites", "compare_equity_efficiency_cost", "output_recommended_plan"].includes(step.id));
      stepsWithDynamics.splice(insertIndex >= 0 ? insertIndex + 1 : stepsWithDynamics.length, 0, ...strategySteps);
    }
    if (outputSteps.length) {
      const currentReportIndex = stepsWithDynamics.findIndex((step) => step.id === "output_report");
      stepsWithDynamics.splice(currentReportIndex >= 0 ? currentReportIndex + 1 : stepsWithDynamics.length, 0, ...outputSteps);
    }

    const finalSteps = normalizeSteps(stepsWithDynamics);
    const planId = `${template.templateId}-${Date.now()}`;
    const plan = {
      planId,
      title: `${taskType.label}：${strategyMeta.label}`,
      taskTypeId: taskType.id,
      taskTypeLabel: taskType.label,
      templateId: template.templateId,
      templateName: template.templateName,
      templateLabel: template.templateName,
      requiredStateFields: template.requiredStateFields,
      requiredTools: uniqueItems([...template.requiredTools, ...finalSteps.map((step) => step.toolId)]),
      outputs: template.outputs,
      nextStepSuggestion: template.nextStepSuggestion,
      strategy,
      strategyLabel: strategyMeta.label,
      goal,
      targetGroups,
      constraints,
      outputType,
      rationale: taskType.needsClarification
        ? "当前目标无法稳定分类，先进入目标理解并提示补充任务对象。"
        : strategyMeta.emphasis,
      steps: finalSteps,
    };

    return {
      ...plan,
      taskGraph: buildTaskGraphFromSteps(finalSteps, plan),
    };
  },
};

export const PlanReviewer = {
  reviewBeforeExecution({ agentState, generatedPlan, taskType, strategy, targetGroups, constraints, preconditions }) {
    const reviewIssues = [];
    let revisedSteps = [...generatedPlan.steps];
    const dependencySteps = [];

    if (taskType.needsClarification) {
      return {
        status: "needsClarification",
        summary: "无法判断任务类型，已进入目标理解。请补充治理对象、空间范围或期望输出。",
        reviewIssues: [{
          issueId: "clarification-1",
          type: "goal_understanding",
          severity: "warning",
          message: "用户输入无法稳定映射到任务类型，需要补充目标。",
          fixAction: "保留目标理解模板，不执行空间分析链。",
        }],
        initialPlan: generatedPlan,
        revisedPlan: generatedPlan,
        reviewedTaskGraph: generatedPlan.taskGraph,
        warnings: [],
        blockers: [],
        humanChecklist: ["补充治理目标", "选择任务类型", "明确输出结果"],
        uncertaintyNotes: ["任务类型尚未确认，当前不输出选址结论。"],
      };
    }

    if (["facility_gap_analysis", "candidate_site_generation", "constraint_revision", "scenario_comparison", "report_generation"].includes(taskType.id) && !hasDiagnosis(agentState)) {
      pushIssue(
        reviewIssues,
        "missing_prerequisite",
        "blocker",
        "缺少风险诊断结果，已在修正计划中补充风险诊断链。",
        "risk_diagnosis_template",
        "prepend_risk_diagnosis",
      );
      dependencySteps.push(...templateSteps("risk_diagnosis_template"));
    }

    if (["candidate_site_generation", "constraint_revision", "scenario_comparison", "report_generation"].includes(taskType.id) && !hasFacilityAudit(agentState)) {
      pushIssue(
        reviewIssues,
        "missing_prerequisite",
        "blocker",
        "缺少设施覆盖核验和设施缺口结果，已在修正计划中补充设施缺口识别链。",
        "facility_gap_template",
        "prepend_facility_gap_analysis",
      );
      dependencySteps.push(...templateSteps("facility_gap_template"));
    }

    if (["scenario_comparison", "report_generation"].includes(taskType.id) && !hasCandidateSites(agentState)) {
      pushIssue(
        reviewIssues,
        "missing_prerequisite",
        "blocker",
        "缺少候选点集合，已在修正计划中补充候选点生成链。",
        "candidate_site_template",
        "prepend_candidate_site_generation",
      );
      dependencySteps.push(...templateSteps("candidate_site_template"));
    }

    if (taskType.id === "report_generation" && !hasScenarioComparison(agentState)) {
      pushIssue(
        reviewIssues,
        "missing_prerequisite",
        "warning",
        "缺少方案比选结果，报告将补充方案比选步骤以保证证据链完整。",
        "scenario_comparison_template",
        "prepend_scenario_comparison",
      );
      dependencySteps.push(...templateSteps("scenario_comparison_template"));
    }

    if (dependencySteps.length) {
      revisedSteps = [...dependencySteps, ...revisedSteps];
    }

    revisedSteps = moveConstraintChecksAfterCandidateGeneration(revisedSteps, agentState, reviewIssues);

    revisedSteps.forEach((step) => {
      const tool = ToolRegistry[step.toolId];
      if (!tool) {
        pushIssue(reviewIssues, "missing_tool", "blocker", `步骤“${step.title}”未匹配可用工具。`, step.id, "manual_tool_mapping_required");
      }
    });

    const available = initialAvailableInputs(agentState, { targetGroups, constraints });
    revisedSteps.forEach((step) => {
      const tool = ToolRegistry[step.toolId];
      if (!tool) return;
      const missingInputs = tool.requiredInputs.filter((input) => !available.has(input));
      if (missingInputs.length) {
        pushIssue(
          reviewIssues,
          "missing_required_inputs",
          "warning",
          `步骤“${step.title}”缺少输入：${missingInputs.join("、")}。`,
          step.id,
          "use_previous_step_outputs_or_request_user_input",
        );
      }
      outputKeysForTool(step.toolId).forEach((output) => available.add(output));
    });

    const hasManualCheckStep = revisedSteps.some((step) => manualCheckToolIds.has(step.toolId));
    if (!hasManualCheckStep) {
      pushIssue(
        reviewIssues,
        "missing_manual_check",
        "warning",
        "任务链缺少人工核验或报告输出步骤，已在修正计划尾部补充人工核验清单生成。",
        "manual_check",
        "append_exportPlanningReport",
      );
      revisedSteps.push({
        id: "manual_checklist_output",
        title: "生成人工核验清单",
        owner: "LLM + Rule",
        toolId: "exportPlanningReport",
        output: "人工核验清单和不确定性说明",
      });
    }

    const hasUncertainty = revisedSteps.some((step) => ToolRegistry[step.toolId]?.limitations?.length);
    if (!hasUncertainty) {
      pushIssue(reviewIssues, "missing_uncertainty", "warning", "任务链缺少不确定性说明。", "uncertainty", "add_tool_limitations_to_report");
    }

    if (["candidate_site_generation", "constraint_revision", "scenario_comparison"].includes(taskType.id) && !revisedSteps.some((step) => step.toolId === "rankCandidateSites")) {
      pushIssue(
        reviewIssues,
        "strategy_mismatch",
        "warning",
        "任务链缺少策略排序步骤，无法体现用户策略偏好。",
        "strategy_sorting",
        "append_rankCandidateSites",
      );
      revisedSteps.push({
        id: `strategy_sorting_${strategy}`,
        title: `${strategyCopy[strategy]?.label ?? "当前策略"}排序`,
        owner: "Rule",
        toolId: "rankCandidateSites",
        output: "按策略排序后的候选点",
      });
    }

    const blockers = reviewIssues.filter((item) => item.severity === "blocker");
    const warnings = [
      ...preconditions.filter((item) => item.severity === "warning").map((item) => item.label),
      ...reviewIssues.filter((item) => item.severity === "warning").map((item) => item.message),
    ];
    const preconditionBlockers = preconditions.filter((item) => item.severity === "blocker").map((item) => item.label);
    const revisedPlanDraft = clonePlanWithSteps(generatedPlan, revisedSteps, {
      planId: `${generatedPlan.planId}-reviewed`,
      title: `${generatedPlan.title}（审查修正）`,
      reviewStatus: blockers.length || preconditionBlockers.length ? "revised_with_blockers" : reviewIssues.length ? "revised" : "approved",
      revisionReason: reviewIssues.length ? "PlanReviewer 自动补齐前置任务、工具链和人工核验要求。" : "初始计划通过执行前审查。",
    });
    const reviewedTaskGraph = annotateTaskGraphWithReview(revisedPlanDraft.taskGraph, reviewIssues);
    const revisedPlan = {
      ...revisedPlanDraft,
      taskGraph: reviewedTaskGraph,
    };

    return {
      status: preconditionBlockers.length ? "needsData" : reviewIssues.length ? "revised" : "approved",
      summary: reviewIssues.length
        ? `发现 ${reviewIssues.length} 个计划问题，已生成修正计划并用于执行。`
        : "初始计划通过执行前审查，可直接进入工具执行。",
      reviewIssues,
      initialPlan: generatedPlan,
      revisedPlan,
      reviewedTaskGraph,
      warnings,
      blockers: [...preconditionBlockers, ...blockers.map((item) => item.message)],
      humanChecklist: [
        "核验候选点可布置空间",
        "核验开放时间、室内容量和管理主体",
        "核验道路红线、消防通道、权属和安全距离",
      ],
      uncertaintyNotes: [
        "当前工具输出为 mock data，可替换为真实 GIS/API 后重新执行。",
        "设施开放时间、容量和权属仍需人工确认。",
      ],
      strategyFit: {
        strategy,
        strategyLabel: strategyCopy[strategy]?.label,
        isSatisfied: revisedPlan.steps.some((step) => step.toolId === "rankCandidateSites"),
      },
    };
  },
};

function buildToolInputs(tool, context, executions) {
  const agentState = context.agentState;
  const heatRiskOutput = getLatestToolOutput(executions, "getHeatRiskZones");
  const populationOutput = getLatestToolOutput(executions, "getPopulationExposure");
  const activityOutput = getLatestToolOutput(executions, "getActivityHotspots");
  const existingOutput = getLatestToolOutput(executions, "getExistingFacilities");
  const coverageOutput = getLatestToolOutput(executions, "getFacilityCoverage");
  const gapOutput = getLatestToolOutput(executions, "findFacilityGaps");
  const candidateOutput = getLatestToolOutput(executions, "generateCandidateSites");
  const rankedOutput = getLatestToolOutput(executions, "rankCandidateSites");
  const scenarioOutput = getLatestToolOutput(executions, "generateCounterfactualPlan");

  const shared = {
    AgentState: agentState,
    studyArea: agentState.project.studyArea,
    scenarioDate: agentState.project.scenarioDate,
    facilityType: agentState.project.facilityType,
    targetGroups: context.targetGroups,
    constraints: context.constraints,
    strategy: context.strategy,
    strategyLabel: strategyCopy[context.strategy]?.label,
    priorityGroups: agentState.project.priorityGroups,
    highRiskZones: heatRiskOutput?.highRiskZones ?? agentState.diagnosis.highRiskZones,
    priorityCells: heatRiskOutput?.priorityCells ?? agentState.diagnosis.priorityCells,
    existingFacilities: existingOutput?.existingFacilities ?? agentState.facilityAudit.existingFacilities,
    activityHotspots: activityOutput?.activityHotspots ?? agentState.diagnosis.activityHotspots,
    coverageRate: coverageOutput?.coverageRate ?? agentState.facilityAudit.coverageRate,
    uncoveredCells: coverageOutput?.uncoveredCells ?? agentState.facilityAudit.uncoveredCells ?? agentState.diagnosis.priorityCells ?? [],
    facilityGaps: gapOutput?.facilityGaps ?? agentState.facilityAudit.facilityGaps,
    candidateSearchArea: gapOutput?.candidateSearchArea ?? agentState.facilityAudit.candidateSearchArea,
    candidateSites: candidateOutput?.candidateSites ?? rankedOutput?.rankedSites ?? agentState.candidateSites,
    rankedSites: rankedOutput?.rankedSites ?? agentState.candidateSites,
    scenarios: scenarioOutput?.scenarios ?? agentState.scenarios,
    groupExposureIndex: populationOutput?.groupExposureIndex,
  };

  return Object.fromEntries([...tool.requiredInputs, ...tool.optionalInputs].map((key) => [key, shared[key]]));
}

const LegacyExecutionEngine = {
  run(plan, context) {
    const executions = [];
    const runId = `tool-run-${Date.now()}`;

    plan.steps.forEach((step) => {
      const tool = ToolRegistry[step.toolId];
      const startedAt = now();

      if (!tool) {
        executions.push({
          runId,
          id: step.id,
          order: step.order,
          title: step.title,
          owner: step.owner,
          toolId: step.toolId,
          toolName: step.toolId,
          toolLabel: step.toolId,
          toolType: "Missing",
          status: "skipped",
          latencyMs: 0,
          startedAt,
          completedAt: now(),
          inputs: {},
          output: { message: "未找到可调用工具，已跳过。" },
          limitations: ["工具尚未注册"],
          nextPossibleTools: [],
        });
        return;
      }

      const inputs = buildToolInputs(tool, context, executions);
      const output = typeof tool.mockResult === "function"
        ? tool.mockResult({ inputs, context, executions })
        : tool.mockResult;

      executions.push({
        runId,
        id: step.id,
        order: step.order,
        title: step.title,
        owner: step.owner,
        toolId: step.toolId,
        toolName: tool.toolName,
        toolLabel: tool.displayName,
        toolType: output?.__dataSource === "local-real" ? "Local Real Data" : "Mock Tool",
        status: "completed",
        latencyMs: 180 + step.order * 35,
        startedAt,
        completedAt: now(),
        requiredInputs: tool.requiredInputs,
        optionalInputs: tool.optionalInputs,
        inputs,
        output,
        limitations: tool.limitations,
        nextPossibleTools: tool.nextPossibleTools,
      });
    });

    return executions;
  },
};

function isMissingValue(value) {
  return value == null || (Array.isArray(value) && value.length === 0);
}

function missingInputsForTool(tool, inputs) {
  return (tool?.requiredInputs ?? []).filter((input) => isMissingValue(inputs[input]));
}

function resultSatisfiesNode(node, tool, output) {
  const expectedOutputs = node.expectedOutputs?.length ? node.expectedOutputs : tool?.outputs ?? [];
  if (!expectedOutputs.length) return true;
  return expectedOutputs.some((key) => !isMissingValue(output?.[key]));
}

export const Replanner = {
  repair({ node, reason, executions }) {
    return {
      eventId: `replan-${node.stepId}-${executions.length + 1}`,
      triggeredAt: now(),
      nodeId: node.stepId,
      reason,
      action: node.humanReviewRequired ? "pause_for_human_review" : "insert_manual_review_node",
      insertedSteps: node.humanReviewRequired ? [] : [{
        stepId: `manual_review_${node.stepId}`,
        stepName: `Manual review for ${node.stepName}`,
        reason: `Inserted because ${node.stepName} could not satisfy downstream requirements.`,
        selectedTool: "exportPlanningReport",
        dependsOn: [node.stepId],
      }],
      skippedSteps: [],
      rollbackTo: node.dependsOn?.at(-1) ?? null,
      explanation: `${node.stepName} triggered Replanner: ${reason}`,
    };
  },
};

export const ExecutionEngine = {
  run(plan, context) {
    const executions = [];
    const replannerEvents = [];
    const runId = `tool-run-${Date.now()}`;
    const sourceGraph = plan.taskGraph ?? buildTaskGraphFromSteps(plan.steps ?? [], plan);
    const nodeState = new Map(sourceGraph.nodes.map((node) => [node.stepId, { ...node }]));

    sourceGraph.executionOrder.forEach((nodeId, index) => {
      const node = nodeState.get(nodeId);
      if (!node) return;

      const step = node.sourceStep ?? plan.steps?.find((item) => item.id === node.stepId) ?? {
        id: node.stepId,
        title: node.stepName,
        toolId: node.selectedTool,
        owner: "Agent",
        order: index + 1,
      };
      const tool = ToolRegistry[node.selectedTool] ?? ToolRegistry[step.toolId];
      const startedAt = now();
      const blockedDependency = node.dependsOn.find((dependencyId) => {
        const dependency = nodeState.get(dependencyId);
        return dependency && !["completed", "needs_review"].includes(dependency.status);
      });

      const pushBlockedExecution = ({ reason, toolType = "Graph Check", output = {} }) => {
        const replanEvent = Replanner.repair({ node, reason, executions });
        replannerEvents.push(replanEvent);
        nodeState.set(node.stepId, {
          ...node,
          status: "blocked",
          blockedReason: reason,
        });
        executions.push({
          runId,
          id: step.id,
          nodeId: node.stepId,
          order: step.order ?? index + 1,
          title: step.title ?? node.stepName,
          owner: step.owner,
          toolId: step.toolId,
          toolName: tool?.toolName ?? node.selectedTool,
          toolLabel: tool?.displayName ?? node.selectedTool,
          toolType,
          status: "blocked",
          nodeStatus: "blocked",
          latencyMs: 0,
          startedAt,
          completedAt: now(),
          requiredInputs: tool?.requiredInputs ?? node.requiredInputs,
          optionalInputs: tool?.optionalInputs ?? [],
          inputs: {},
          output,
          limitations: [node.fallbackPlan],
          nextPossibleTools: tool?.nextPossibleTools ?? [],
          dependsOn: node.dependsOn,
          expectedOutputs: node.expectedOutputs,
          toolCandidates: node.toolCandidates,
          selectionReason: node.selectionReason,
          blockedReason: reason,
          needsReviewReason: "",
          replannerEvent: replanEvent,
        });
      };

      if (blockedDependency) {
        pushBlockedExecution({
          reason: `Dependency ${blockedDependency} is not ready.`,
          toolType: "Dependency Check",
          output: { blockedDependency },
        });
        return;
      }

      if (!tool) {
        pushBlockedExecution({
          reason: `Selected tool ${node.selectedTool} is not registered.`,
          toolType: "Missing Tool",
          output: { selectedTool: node.selectedTool },
        });
        return;
      }

      const inputs = buildToolInputs(tool, context, executions);
      const missingInputs = missingInputsForTool(tool, inputs);
      if (missingInputs.length) {
        pushBlockedExecution({
          reason: `Missing required inputs: ${missingInputs.join(", ")}.`,
          toolType: "Input Check",
          output: { missingInputs },
        });
        return;
      }

      const output = typeof tool.mockResult === "function"
        ? tool.mockResult({ inputs, context, executions })
        : tool.mockResult;
      const hasSufficientResult = resultSatisfiesNode(node, tool, output);
      const insufficientReason = hasSufficientResult ? "" : `Tool ${tool.toolName} did not produce required outputs: ${(node.expectedOutputs ?? []).join(", ")}.`;
      const replanEvent = hasSufficientResult ? null : Replanner.repair({ node, reason: insufficientReason, executions });
      if (replanEvent) replannerEvents.push(replanEvent);
      const nodeStatus = !hasSufficientResult ? "blocked" : node.humanReviewRequired ? "needs_review" : "completed";

      nodeState.set(node.stepId, {
        ...node,
        status: nodeStatus,
        blockedReason: insufficientReason,
        needsReviewReason: node.humanReviewRequired ? "Requires planner verification before final adoption." : "",
      });

      executions.push({
        runId,
        id: step.id,
        nodeId: node.stepId,
        order: step.order ?? index + 1,
        title: step.title ?? node.stepName,
        owner: step.owner,
        toolId: step.toolId,
        toolName: tool.toolName,
        toolLabel: tool.displayName,
        toolType: output?.__dataSource === "local-real" ? "Local Real Data" : "Mock Tool",
        status: hasSufficientResult ? "completed" : "blocked",
        nodeStatus,
        latencyMs: 180 + (step.order ?? index + 1) * 35,
        startedAt,
        completedAt: now(),
        requiredInputs: tool.requiredInputs,
        optionalInputs: tool.optionalInputs,
        inputs,
        output,
        limitations: tool.limitations,
        nextPossibleTools: tool.nextPossibleTools,
        dependsOn: node.dependsOn,
        expectedOutputs: node.expectedOutputs,
        toolCandidates: node.toolCandidates,
        selectionReason: node.selectionReason,
        blockedReason: insufficientReason,
        needsReviewReason: node.humanReviewRequired ? "Requires planner verification before final adoption." : "",
        replannerEvent: replanEvent,
      });
    });

    const executedNodes = sourceGraph.executionOrder.map((nodeId) => nodeState.get(nodeId)).filter(Boolean);
    executions.taskGraph = cloneTaskGraphWithNodes(sourceGraph, executedNodes, {
      status: executedNodes.some((node) => node.status === "blocked")
        ? "blocked"
        : executedNodes.some((node) => node.status === "needs_review")
          ? "needs_review"
          : "completed",
      replannerEvents,
      completedAt: now(),
    });
    executions.replannerEvents = replannerEvents;

    return executions;
  },
};

function buildLatestToolOutputs(executions) {
  return executions.reduce((acc, execution) => {
    acc[execution.toolName] = {
      status: execution.status,
      completedAt: execution.completedAt,
      output: execution.output,
      limitations: execution.limitations,
    };
    return acc;
  }, {});
}

const constraintImpactRules = {
  spatial_exclusion: {
    label: "空间排除",
    patterns: [/避开/, /学校门口/, /道路红线/, /消防通道/, /红线/, /权属/],
    affectedSteps: ["候选点生成", "空间约束检查", "方案比选"],
    needRerunTools: ["generateCandidateSites", "checkSpatialConstraints", "rankCandidateSites", "generateCounterfactualPlan", "comparePlans"],
    preservedResults: ["风险诊断结果", "重点人群暴露结果", "现有设施覆盖结果"],
    suggestedRestartStep: "generate_candidate_sites",
  },
  group_weight: {
    label: "人群权重",
    patterns: [/提高.*权重/, /老人/, /老年/, /儿童/, /孩子/, /户外劳动者/, /配送/, /巡查/, /重点人群/, /优先.*人群/],
    affectedSteps: ["重点人群暴露分析", "候选点评分", "方案比选"],
    needRerunTools: ["getPopulationExposure", "rankCandidateSites", "generateCounterfactualPlan", "comparePlans"],
    preservedResults: ["热风险空间单元", "现有设施点", "基础服务范围"],
    suggestedRestartStep: "people_exposure_analysis",
  },
  cost_preference: {
    label: "成本偏好",
    patterns: [/降低成本/, /低成本/, /预算/, /存量复用/, /优先存量/, /复用/, /社区服务中心/, /公共服务设施/],
    affectedSteps: ["候选点评分", "方案比选"],
    needRerunTools: ["rankCandidateSites", "generateCounterfactualPlan", "comparePlans"],
    preservedResults: ["风险诊断结果", "设施缺口识别结果", "候选点空间集合"],
    suggestedRestartStep: "score_candidate_sites",
  },
  facility_preference: {
    label: "设施类型偏好",
    patterns: [/遮阴棚/, /遮阴/, /饮水点/, /饮水/, /休憩点/, /休息点/, /座椅/, /清凉驿站/, /优先.*设施/],
    affectedSteps: ["候选点生成", "方案比选", "报告输出"],
    needRerunTools: ["generateCandidateSites", "rankCandidateSites", "generateCounterfactualPlan", "comparePlans", "exportPlanningReport"],
    preservedResults: ["风险诊断结果", "重点人群暴露结果", "设施覆盖结果"],
    suggestedRestartStep: "generate_candidate_sites",
  },
  accessibility_requirement: {
    label: "可达性要求",
    patterns: [/步行距离/, /小于\s*300/, /300m/, /300米/, /15分钟/, /十五分钟/, /可达/, /绕行/, /距离/],
    affectedSteps: ["步行可达分析", "设施缺口识别", "候选点生成"],
    needRerunTools: ["calculateWalkDistance", "findFacilityGaps", "generateCandidateSites", "rankCandidateSites"],
    preservedResults: ["风险诊断结果", "重点人群识别结果", "现有设施点"],
    suggestedRestartStep: "calculate_walk_distance",
  },
};

function detectConstraintImpactType({ goal = "", constraints = [], strategy }) {
  const text = `${goal} ${(constraints ?? []).join(" ")}`.toLowerCase();
  if (/避开|学校门口|道路红线|消防通道|权属/.test(text)) {
    return { constraintType: "spatial_exclusion", rule: constraintImpactRules.spatial_exclusion, score: 99 };
  }
  if (/步行距离|300m|300米|15分钟|十五分钟|可达|绕行|距离/.test(text)) {
    return { constraintType: "accessibility_requirement", rule: constraintImpactRules.accessibility_requirement, score: 99 };
  }
  if (/降低成本|低成本|预算|存量复用|优先存量|复用|社区服务中心|公共服务设施/.test(text)) {
    return { constraintType: "cost_preference", rule: constraintImpactRules.cost_preference, score: 99 };
  }
  if (/遮阴棚|遮阴|饮水点|饮水|休憩点|休息点|座椅|清凉驿站/.test(text)) {
    return { constraintType: "facility_preference", rule: constraintImpactRules.facility_preference, score: 99 };
  }
  if (/提高.*权重|老人|老年|儿童|孩子|户外劳动者|配送|巡查|重点人群|优先.*人群/.test(text)) {
    return { constraintType: "group_weight", rule: constraintImpactRules.group_weight, score: 99 };
  }
  const scored = Object.entries(constraintImpactRules)
    .map(([constraintType, rule]) => ({
      constraintType,
      rule,
      score: rule.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best?.score > 0) return best;

  if (strategy === "reuse" || strategy === "cost") {
    return { constraintType: "cost_preference", rule: constraintImpactRules.cost_preference, score: 1 };
  }
  if (strategy === "coverage") {
    return { constraintType: "accessibility_requirement", rule: constraintImpactRules.accessibility_requirement, score: 1 };
  }
  return { constraintType: "group_weight", rule: constraintImpactRules.group_weight, score: 0 };
}

function makeConstraintExplanation(rule) {
  return `该约束将影响：${rule.affectedSteps.join("、")}；${rule.preservedResults.join("、")}可保留。`;
}

export const ConstraintImpactAnalyzer = {
  analyze({ strategy, taskType, goal, constraints, taskGraph }) {
    if (taskType.needsClarification) {
      return {
        constraintType: "goal_understanding",
        affectedSteps: ["目标理解"],
        needRerunTools: [],
        preservedResults: [],
        suggestedRestartStep: "goal_understanding",
        explanation: "当前目标尚不明确，需先补充治理目标，再判断影响范围。",
        strategy,
        strategyLabel: "待确认",
        taskFit: taskType.label,
        impacts: [
          { dimension: "任务类型", impact: "待补充", note: "需要先明确是诊断、缺口、选址、比选、调约束还是报告。" },
          { dimension: "工具链", impact: "暂不执行真实计算", note: "当前只运行目标理解与补充提示。" },
        ],
      };
    }

    const meta = strategyCopy[strategy] ?? strategyCopy.equity;
    const detected = detectConstraintImpactType({ goal, constraints, strategy });
    const rule = detected.rule;
    const affectedNodes = (taskGraph?.nodes ?? [])
      .filter((node) => rule.needRerunTools.includes(node.selectedTool)
        || rule.affectedSteps.some((stepName) => node.stepName?.includes(stepName)))
      .map((node) => ({
        stepId: node.stepId,
        stepName: node.stepName,
        selectedTool: node.selectedTool,
        status: "needs_review",
      }));

    return {
      constraintType: detected.constraintType,
      affectedSteps: rule.affectedSteps,
      needRerunTools: rule.needRerunTools,
      affectedNodes,
      rerunNodeIds: affectedNodes.map((node) => node.stepId),
      preservedResults: rule.preservedResults,
      suggestedRestartStep: rule.suggestedRestartStep,
      explanation: makeConstraintExplanation(rule),
      strategy,
      strategyLabel: meta.label,
      taskFit: taskType.label,
      impacts: rule.affectedSteps.map((step) => ({
        dimension: step,
        impact: "需要重新执行",
        note: `${rule.label}会改变${step}的输入或排序权重。`,
      })),
    };
  },
};

export const NextStepRecommender = {
  recommend({ review, taskType }) {
    if (taskType.needsClarification) {
      return [
        "补充更明确的治理目标，例如“识别哪里缺清凉设施”或“生成候选点”。",
        "选择任务类型：风险诊断、设施缺口、候选点、方案比选、约束调整或报告生成。",
        "明确输出形式，例如地图、候选点清单、方案对比表或汇报材料。",
      ];
    }

    const shared = [
      "导出候选点和人工核验清单，交由责任规划师现场复核。",
      "补充设施开放时间、室内容量、管理主体等非空间数据。",
      "将通过复核的点位进入反事实方案比选。",
    ];

    if (review.status === "needsData") return ["先补齐阻断项数据，再重新执行任务链。", ...shared.slice(0, 2)];
    if (taskType.id === "risk_diagnosis") return ["将高风险区与设施覆盖结果叠加，进入设施缺口识别。", ...shared.slice(1)];
    if (taskType.id === "facility_gap_analysis") return ["把设施缺口区转入候选点生成，优先处理未覆盖人口高的单元。", ...shared];
    if (taskType.id === "scenario_comparison") return ["选择一个推荐方案进入人工复核，并记录约束变化。", ...shared];
    if (taskType.id === "report_generation") return ["检查报告中的证据链、地图截图和人工核验清单是否完整。", ...shared.slice(0, 2)];
    return ["优先核验学校、医院、社区服务节点周边可布置空间。", ...shared];
  },
};

function makeVersionSummary({ strategy, constraintImpact }) {
  const strategyLabel = strategyCopy[strategy]?.label ?? "当前策略";
  const type = constraintImpact?.constraintType;
  if (type === "spatial_exclusion") return "避开学校门口方案";
  if (type === "cost_preference") return strategy === "reuse" ? "存量复用优先方案" : "低成本优先方案";
  if (type === "facility_preference") return "设施类型偏好方案";
  if (type === "accessibility_requirement") return "步行可达优化方案";
  if (type === "group_weight") return `${strategyLabel}方案`;
  return `${strategyLabel}方案`;
}

function buildIntent({ goal, taskType, strategy, targetGroups, constraints, classification }) {
  return {
    rawUserInput: goal,
    taskType: taskType.id,
    taskTypeLabel: taskType.label,
    parsedGoal: taskType.needsClarification
      ? "当前输入无法稳定判断任务类型，进入目标理解并等待补充。"
      : `将“${goal}”转译为“${taskType.label}”空间任务。`,
    targetGroups,
    planningObject: planningObjectByTask[taskType.id] ?? "清凉设施响应单元",
    strategy,
    outputType: taskOutputType[taskType.id] ?? "siteSelectionPlan",
    constraints,
    possibleOutputs: taskType.outputs,
    needsClarification: Boolean(taskType.needsClarification),
    classification: {
      taskType: taskType.id,
      taskTypeLabel: taskType.label,
      confidence: classification?.confidence ?? 0,
      matchedKeywords: classification?.matchedKeywords ?? [],
      source: classification?.source ?? "unknown",
      candidateScores: classification?.candidateScores ?? [],
    },
    clarificationPrompt: taskType.needsClarification
      ? "请补充你希望 Agent 完成的任务：风险诊断、设施缺口识别、候选点生成、方案比选、约束调整或报告生成。"
      : "",
  };
}

function mergeCandidateConstraints(candidateSites, constraintOutput) {
  if (!constraintOutput?.feasibility && !constraintOutput?.manualCheck) return candidateSites;

  return candidateSites.map((site) => ({
    ...site,
    feasibility: constraintOutput.feasibility?.[site.siteId] ?? site.feasibility,
    manualCheck: uniqueItems([...(site.manualCheck ?? []), ...(constraintOutput.manualCheck ?? [])]),
  }));
}

function applyToolResultsToAgentState(previousState, executions, strategy) {
  const heatRisk = getLatestToolOutput(executions, "getHeatRiskZones");
  const population = getLatestToolOutput(executions, "getPopulationExposure");
  const activity = getLatestToolOutput(executions, "getActivityHotspots");
  const existing = getLatestToolOutput(executions, "getExistingFacilities");
  const coverage = getLatestToolOutput(executions, "getFacilityCoverage");
  const distance = getLatestToolOutput(executions, "calculateWalkDistance");
  const gaps = getLatestToolOutput(executions, "findFacilityGaps");
  const generated = getLatestToolOutput(executions, "generateCandidateSites");
  const constraints = getLatestToolOutput(executions, "checkSpatialConstraints");
  const ranked = getLatestToolOutput(executions, "rankCandidateSites");
  const scenarios = getLatestToolOutput(executions, "generateCounterfactualPlan");
  const comparison = getLatestToolOutput(executions, "comparePlans");
  const reportOutput = getLatestToolOutput(executions, "exportPlanningReport");

  let candidateSites = ranked?.rankedSites ?? generated?.candidateSites ?? previousState.candidateSites ?? mockCandidateSites;
  candidateSites = mergeCandidateConstraints(candidateSites, constraints);

  return {
    ...previousState,
    diagnosis: {
      ...previousState.diagnosis,
      highRiskZones: heatRisk?.highRiskZones?.map((zone) => zone.name) ?? previousState.diagnosis.highRiskZones,
      exposedPopulation: population?.exposedPopulation ?? previousState.diagnosis.exposedPopulation,
      activityHotspots: activity?.activityHotspots?.map((item) => item.name) ?? previousState.diagnosis.activityHotspots,
      priorityCells: heatRisk?.priorityCells ?? previousState.diagnosis.priorityCells,
      riskLevel: heatRisk?.riskLevel ?? previousState.diagnosis.riskLevel,
      groupExposureIndex: population?.groupExposureIndex ?? previousState.diagnosis.groupExposureIndex,
    },
    facilityAudit: {
      ...previousState.facilityAudit,
      existingFacilities: existing?.existingFacilities ?? previousState.facilityAudit.existingFacilities,
      coverageRate: coverage?.coverageRate ?? previousState.facilityAudit.coverageRate,
      facilityGaps: gaps?.facilityGaps ?? previousState.facilityAudit.facilityGaps,
      avgWalkDistance: distance?.avgWalkDistance ?? previousState.facilityAudit.avgWalkDistance,
      uncoveredPopulation: gaps?.uncoveredPopulation ?? previousState.facilityAudit.uncoveredPopulation,
      candidateSearchArea: gaps?.candidateSearchArea ?? previousState.facilityAudit.candidateSearchArea,
      coveredCells: coverage?.coveredCells ?? previousState.facilityAudit.coveredCells,
      uncoveredCells: coverage?.uncoveredCells ?? previousState.facilityAudit.uncoveredCells,
      routePressure: distance?.routePressure ?? previousState.facilityAudit.routePressure,
    },
    candidateSites,
    scenarios: scenarios?.scenarios ?? previousState.scenarios,
    report: {
      ...previousState.report,
      selectedPlan: comparison?.recommendedPlan ?? strategyCopy[strategy]?.scenarioKey ?? previousState.report.selectedPlan,
      evidenceSummary: comparison?.reason ?? previousState.report.evidenceSummary,
      uncertainty: reportOutput?.uncertainty ?? previousState.report.uncertainty,
      manualChecklist: reportOutput?.manualChecklist ?? previousState.report.manualChecklist,
      exportStatus: reportOutput?.report?.exportStatus ?? previousState.report.exportStatus,
      reportStructure: reportOutput?.report?.sections ?? previousState.report.reportStructure,
      comparisonTable: comparison?.comparisonTable ?? previousState.report.comparisonTable,
      topCandidateSites: candidateSites.slice(0, 3).map((site) => site.locationName),
    },
  };
}

export function runPlanningAgent({
  previousState = createInitialAgentState(),
  goal,
  strategy = "equity",
  taskTypeHint,
}) {
  const plannerResult = Planner.generate({
    agentState: previousState,
    goal,
    strategy,
    taskTypeHint,
  });
  const {
    taskType,
    targetGroups,
    constraints,
    outputType,
    preconditions,
    generatedPlan,
    classification,
  } = plannerResult;

  const reviewedPlan = PlanReviewer.reviewBeforeExecution({
    agentState: previousState,
    generatedPlan,
    taskType,
    strategy,
    targetGroups,
    constraints,
    preconditions,
  });
  const executablePlan = reviewedPlan.revisedPlan ?? generatedPlan;
  const toolCallHistory = ExecutionEngine.run(executablePlan, {
    agentState: previousState,
    goal,
    taskType,
    strategy,
    preconditions,
    targetGroups,
    constraints,
    outputType,
  });
  const executedTaskGraph = toolCallHistory.taskGraph ?? executablePlan.taskGraph;
  const replannerEvents = toolCallHistory.replannerEvents ?? [];
  const stateWithToolResults = applyToolResultsToAgentState(previousState, toolCallHistory, strategy);
  const combinedToolCallHistory = [
    ...(previousState.workflow?.toolCallHistory ?? []),
    ...toolCallHistory,
  ];
  const latestToolOutputs = buildLatestToolOutputs(toolCallHistory);
  const constraintImpact = ConstraintImpactAnalyzer.analyze({ strategy, taskType, goal, constraints, taskGraph: executedTaskGraph });
  const nextSteps = NextStepRecommender.recommend({ review: reviewedPlan, taskType });
  const previousVersionHistory = previousState.workflow?.versionHistory ?? [];
  const versionSummary = makeVersionSummary({ strategy, constraintImpact });

  return {
    ...stateWithToolResults,
    project: {
      ...stateWithToolResults.project,
      defaultStrategy: strategy,
    },
    intent: buildIntent({ goal, taskType, strategy, targetGroups, constraints, classification }),
    workflow: {
      currentStep: taskType.needsClarification ? "goal_understanding" : "review_completed",
      completedSteps: toolCallHistory.filter((item) => item.status === "completed").map((item) => item.id),
      pendingSteps: taskType.needsClarification ? ["等待用户补充目标"] : [],
      generatedPlan,
      reviewedPlan,
      executedPlan: executablePlan,
      taskGraph: generatedPlan.taskGraph,
      reviewedTaskGraph: reviewedPlan.reviewedTaskGraph ?? executablePlan.taskGraph,
      executedTaskGraph,
      toolCallHistory: combinedToolCallHistory,
      latestRunToolCallHistory: toolCallHistory,
      replannerEvents: [
        ...(previousState.workflow?.replannerEvents ?? []),
        ...replannerEvents,
      ],
      versionHistory: [
        ...previousVersionHistory,
        createAgentVersionEntry(
          `${versionSummary}：识别任务类型为${taskType.label}；${constraintImpact.explanation}`,
          previousVersionHistory,
        ),
      ],
    },
    agent: {
      status: taskType.needsClarification ? "needsClarification" : "completed",
      currentGoal: goal,
      selectedTaskType: taskType.id,
      strategy,
      createdAt: previousState.agent?.createdAt ?? now(),
      updatedAt: now(),
    },
    runtime: {
      ...(stateWithToolResults.runtime ?? {}),
      preconditions,
      constraintImpact,
      nextSteps,
      taskClassification: classification,
      latestToolOutputs,
      toolRegistryVersion: toolCallHistory.some((item) => item.output?.__dataSource === "local-real")
        ? "local-real-tool-registry-v1"
        : "mock-tool-registry-v1",
      plannerVersion: "planner-reviewer-v1",
    },
  };
}
