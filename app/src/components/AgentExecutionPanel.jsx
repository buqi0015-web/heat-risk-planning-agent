import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  DatabaseZap,
  FileText,
  GitBranch,
  ListChecks,
  MapPinned,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";

const statusLabels = {
  pass: "已满足",
  warning: "mock/待替换",
  blocker: "待补齐",
  completed: "completed",
  running: "running",
  pending: "pending",
  planned: "pending",
  needs_review: "needs_review",
  blocked: "blocked",
  skipped: "skipped",
  failed: "failed",
};

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function formatList(value, fallback = "待 Agent 识别") {
  const list = asList(value);
  return list.length ? list.join("、") : fallback;
}

function formatPercent(value) {
  if (typeof value !== "number") return "待计算";
  return `${Math.round(value * 100)}%`;
}

function summarizeValue(value, maxItems = 3) {
  if (value == null) return "无";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "空列表";
    return value
      .slice(0, maxItems)
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.name) return item.name;
        if (item?.locationName) return item.locationName;
        if (item?.id) return item.id;
        if (item?.siteId) return item.siteId;
        return "结构化对象";
      })
      .join("、");
  }
  const keys = Object.keys(value);
  if (!keys.length) return "空对象";
  return keys
    .slice(0, maxItems)
    .map((key) => {
      const item = value[key];
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return `${key}: ${item}`;
      }
      if (Array.isArray(item)) return `${key}: ${item.length}项`;
      if (item && typeof item === "object") return `${key}: 对象`;
      return key;
    })
    .join("；");
}

function getPlanForDisplay(workflow = {}) {
  return workflow.reviewedPlan?.revisedPlan
    ?? workflow.executedPlan
    ?? workflow.generatedPlan
    ?? workflow.reviewedPlan?.initialPlan
    ?? null;
}

function getTaskGraphForDisplay(workflow = {}) {
  return workflow.executedTaskGraph
    ?? workflow.reviewedTaskGraph
    ?? workflow.reviewedPlan?.reviewedTaskGraph
    ?? workflow.executedPlan?.taskGraph
    ?? workflow.reviewedPlan?.revisedPlan?.taskGraph
    ?? workflow.taskGraph
    ?? workflow.generatedPlan?.taskGraph
    ?? null;
}

function getStepStatus(step, completedStepIds, reviewIssues) {
  if (completedStepIds.has(step.id)) return "completed";
  if (reviewIssues.some((issue) => issue.stepId === step.id || issue.fixAction?.includes(step.id))) return "needs_review";
  return step.status === "planned" ? "pending" : (step.status ?? "pending");
}

function StatusPill({ status }) {
  const normalizedStatus = status ?? "pending";
  return (
    <span className={`agent-status-pill agent-status-pill--${normalizedStatus}`}>
      {statusLabels[normalizedStatus] ?? normalizedStatus}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, caption }) {
  return (
    <div className="agent-workflow-section__head">
      <span><Icon size={14} />{title}</span>
      {caption ? <small>{caption}</small> : null}
    </div>
  );
}

function InfoTag({ children, tone = "neutral" }) {
  return <span className={`agent-info-tag agent-info-tag--${tone}`}>{children}</span>;
}

function IntentField({ label, value, icon: Icon }) {
  return (
    <div className="agent-intent-field">
      <span>{Icon ? <Icon size={13} /> : null}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlanStepRow({ step, status }) {
  return (
    <article className={`agent-workflow-step agent-workflow-step--${status}`}>
      <div className="agent-workflow-step__marker">
        <span />
      </div>
      <div className="agent-workflow-step__body">
        <div className="agent-workflow-step__top">
          <code>{step.id}</code>
          <StatusPill status={status} />
        </div>
        <h4>{step.title ?? step.stepName ?? step.id}</h4>
        <p>{step.output ?? step.purpose ?? "输出结构化规划中间结果"}</p>
        <div className="agent-workflow-step__meta">
          <InfoTag tone="tool">{step.toolId ?? step.requiredTool ?? "manual_review"}</InfoTag>
          <InfoTag>{step.owner ?? "Agent"}</InfoTag>
        </div>
      </div>
    </article>
  );
}

function TaskGraphNodeCard({ node, affected }) {
  const reason = node.blockedReason || node.needsReviewReason;

  return (
    <article className={`agent-task-node agent-task-node--${node.status} ${affected ? "agent-task-node--affected" : ""}`}>
      <div className="agent-task-node__rail">
        <span />
      </div>
      <div className="agent-task-node__body">
        <div className="agent-task-node__top">
          <code>{node.stepId}</code>
          <StatusPill status={affected ? "needs_review" : node.status} />
        </div>
        <h4>{node.stepName}</h4>
        <p>{node.reason}</p>
        <div className="agent-task-node__matrix">
          <div>
            <small>requiredInputs</small>
            <strong>{formatList(node.requiredInputs, "无前置输入")}</strong>
          </div>
          <div>
            <small>expectedOutputs</small>
            <strong>{formatList(node.expectedOutputs, "结构化结果")}</strong>
          </div>
          <div>
            <small>dependsOn</small>
            <strong>{formatList(node.dependsOn, "可直接执行")}</strong>
          </div>
          <div>
            <small>toolCandidates</small>
            <strong>{formatList(node.toolCandidates, "未匹配")}</strong>
          </div>
        </div>
        <div className="agent-task-node__tool">
          <InfoTag tone="tool">{node.selectedTool}</InfoTag>
          <span>{node.selectionReason}</span>
        </div>
        {reason || affected ? (
          <div className="agent-task-node__alert">
            <AlertTriangle size={12} />
            <span>{affected ? "新增约束影响该节点，需要进入复核或重跑。" : reason}</span>
          </div>
        ) : null}
        <footer>
          <span>{node.humanReviewRequired ? "需要人工复核" : "可自动执行"}</span>
          <p>{node.fallbackPlan}</p>
        </footer>
      </div>
    </article>
  );
}

function ToolCallCard({ execution }) {
  return (
    <article className="agent-tool-card">
      <div className="agent-tool-card__head">
        <span>{String(execution.order ?? 0).padStart(2, "0")}</span>
        <strong>{execution.toolLabel ?? execution.toolName}</strong>
        <StatusPill status={execution.status} />
      </div>
      <div className="agent-tool-card__grid">
        <div>
          <small>inputSummary</small>
          <p>{summarizeValue(execution.inputs)}</p>
        </div>
        <div>
          <small>outputSummary</small>
          <p>{summarizeValue(execution.output)}</p>
        </div>
      </div>
      <footer>
        <InfoTag tone="tool">{execution.toolName}</InfoTag>
        <span>{execution.limitations?.[0] ?? "当前为 mock 工具结果"}</span>
      </footer>
    </article>
  );
}

function PlanReviewStrip({ generatedPlan, review }) {
  const initialCount = review?.initialPlan?.steps?.length ?? generatedPlan?.steps?.length ?? 0;
  const revisedCount = review?.revisedPlan?.steps?.length ?? 0;
  const issueCount = review?.reviewIssues?.length ?? 0;

  return (
    <div className="agent-plan-review-strip">
      <div>
        <span>初始计划</span>
        <strong>{initialCount} 步</strong>
      </div>
      <div>
        <span>审查问题</span>
        <strong>{issueCount} 项</strong>
      </div>
      <div>
        <span>修正计划</span>
        <strong>{revisedCount || initialCount} 步</strong>
      </div>
    </div>
  );
}

function ConclusionItem({ title, value, evidence }) {
  return (
    <article className="agent-conclusion-item">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{evidence}</p>
    </article>
  );
}

export function AgentExecutionPanel({ agentState, onNextStep }) {
  const workflow = agentState?.workflow ?? {};
  const runtime = agentState?.runtime ?? {};
  const intent = agentState?.intent ?? {};
  const diagnosis = agentState?.diagnosis ?? {};
  const facilityAudit = agentState?.facilityAudit ?? {};
  const report = agentState?.report ?? {};
  const candidateSites = agentState?.candidateSites ?? [];
  const scenarios = agentState?.scenarios ?? {};
  const generatedPlan = workflow.generatedPlan;
  const reviewedPlan = workflow.reviewedPlan;
  const displayPlan = getPlanForDisplay(workflow);
  const displayTaskGraph = getTaskGraphForDisplay(workflow);
  const reviewIssues = reviewedPlan?.reviewIssues ?? [];
  const preconditions = runtime.preconditions ?? [];
  const completedStepIds = new Set(workflow.completedSteps ?? []);
  const latestToolCalls = workflow.latestRunToolCallHistory ?? [];
  const allToolCalls = workflow.toolCallHistory ?? [];
  const visibleToolCalls = (latestToolCalls.length ? latestToolCalls : allToolCalls).slice(-6);
  const nextSteps = runtime.nextSteps ?? [];
  const classification = intent.classification ?? runtime.taskClassification;
  const constraintImpact = runtime.constraintImpact;
  const affectedNodeIds = new Set(constraintImpact?.rerunNodeIds ?? constraintImpact?.affectedNodes?.map((node) => node.stepId) ?? []);
  const missingConditions = preconditions.filter((item) => item.severity !== "pass");
  const satisfiedConditions = preconditions.filter((item) => item.severity === "pass");
  const supplementalNeeded = missingConditions.length > 0 || reviewIssues.some((issue) => ["missing_prerequisite", "missing_required_inputs"].includes(issue.type));
  const selectedScenario = scenarios[report.selectedPlan];
  const manualChecks = [
    ...(report.manualChecklist ?? []),
    ...candidateSites.flatMap((site) => site.manualCheck ?? []).slice(0, 4),
  ];
  const cannotAutoDecide = reviewedPlan?.humanChecklist?.length
    ? reviewedPlan.humanChecklist
    : ["权属边界与临时占用许可", "开放时间、容量与运维主体", "校门口、消防通道和道路安全影响"];

  return (
    <section className="agent-execution-panel agent-workflow-panel" aria-label="Agent 执行过程">
      <div className="agent-execution-panel__header">
        <div>
          <span><GitBranch size={14} />Agent Execution Panel</span>
          <h3>{displayPlan?.title ?? "目标理解与规划任务编排"}</h3>
        </div>
        <b>{displayPlan?.strategyLabel ?? intent.strategy ?? "Agent"}</b>
      </div>

      <div className="agent-workflow-statusbar">
        <div>
          <Sparkles size={14} />
          <span>任务类型</span>
          <strong>{intent.taskTypeLabel ?? displayPlan?.taskTypeLabel ?? "目标理解"}</strong>
        </div>
        <div>
          <DatabaseZap size={14} />
          <span>本轮工具</span>
          <strong>{latestToolCalls.length || visibleToolCalls.length} calls</strong>
        </div>
        <div>
          <ShieldAlert size={14} />
          <span>审查状态</span>
          <strong>{reviewedPlan?.summary ?? "等待计划审查"}</strong>
        </div>
      </div>

      <section className="agent-workflow-section">
        <SectionHeader icon={Target} title="目标理解" caption="自然语言目标转译为空间规划任务" />
        <div className="agent-user-goal">
          <span>rawUserInput</span>
          <p>{intent.rawUserInput ?? "等待规划师输入治理目标"}</p>
        </div>
        <div className="agent-intent-grid">
          <IntentField label="taskType" value={intent.taskTypeLabel ?? intent.taskType ?? "goal_understanding"} icon={Sparkles} />
          <IntentField label="targetGroups" value={formatList(intent.targetGroups)} icon={Users} />
          <IntentField label="planningObject" value={intent.planningObject ?? "清凉设施响应单元"} icon={MapPinned} />
          <IntentField label="strategy" value={displayPlan?.strategyLabel ?? intent.strategy ?? "默认策略"} icon={GitBranch} />
          <IntentField label="outputType" value={intent.outputType ?? displayPlan?.outputType ?? "structuredPlan"} icon={FileText} />
          <IntentField label="confidence" value={`${Math.round((classification?.confidence ?? 0) * 100)}%`} icon={CheckCircle2} />
        </div>
        <div className="agent-tag-row">
          {(classification?.matchedKeywords?.length ? classification.matchedKeywords : ["等待关键词匹配"]).slice(0, 5).map((keyword) => (
            <InfoTag key={keyword} tone={classification?.matchedKeywords?.length ? "signal" : "warning"}>{keyword}</InfoTag>
          ))}
        </div>
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={ClipboardCheck} title="前置条件检查" caption={supplementalNeeded ? "需要补充分析或人工确认" : "可进入 mock 工具链"} />
        <div className="agent-precheck-grid">
          <div>
            <span>已满足条件</span>
            <p>{formatList(satisfiedConditions.map((item) => item.label), "暂无已满足项")}</p>
          </div>
          <div>
            <span>缺失/待核验条件</span>
            <p>{formatList(missingConditions.map((item) => item.label), "未发现阻断条件")}</p>
          </div>
          <div className="agent-precheck-grid__full">
            <StatusPill status={supplementalNeeded ? "warning" : "pass"} />
            <strong>{supplementalNeeded ? "需要补充分析：PlanReviewer 已自动修正任务链" : "前置条件满足：可直接执行工作流"}</strong>
          </div>
        </div>
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={ListChecks} title="任务拆解" caption={displayTaskGraph ? "taskGraph" : "generatedPlan / reviewedPlan"} />
        <PlanReviewStrip generatedPlan={generatedPlan} review={reviewedPlan} />
        {reviewIssues.length ? (
          <div className="agent-review-issue-list">
            {reviewIssues.slice(0, 3).map((issue) => (
              <p key={issue.issueId}><AlertTriangle size={12} />{issue.message}</p>
            ))}
          </div>
        ) : null}
        {displayTaskGraph ? (
          <div className="agent-task-graph">
            <div className="agent-task-graph__summary">
              <InfoTag tone="signal">{displayTaskGraph.status ?? "pending"}</InfoTag>
              <span>{displayTaskGraph.nodes?.length ?? 0} nodes</span>
              <span>{displayTaskGraph.edges?.length ?? 0} dependencies</span>
              <span>{displayTaskGraph.replannerEvents?.length ?? 0} replans</span>
            </div>
            <div className="agent-task-node-list">
              {(displayTaskGraph.nodes ?? []).map((node) => (
                <TaskGraphNodeCard
                  key={node.stepId}
                  node={node}
                  affected={affectedNodeIds.has(node.stepId)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="agent-workflow-step-list">
            {(displayPlan?.steps ?? []).map((step) => (
              <PlanStepRow
                key={`${step.id}-${step.order}`}
                step={step}
                status={getStepStatus(step, completedStepIds, reviewIssues)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={Wrench} title="工具调用" caption={`累计 ${allToolCalls.length} 次 mock tool call`} />
        <div className="agent-tool-call-list">
          {visibleToolCalls.length ? visibleToolCalls.map((execution) => (
            <ToolCallCard key={`${execution.runId ?? "run"}-${execution.order}-${execution.id}`} execution={execution} />
          )) : (
            <p className="agent-empty-note">等待 ExecutionEngine 调用 ToolRegistry。</p>
          )}
        </div>
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={MapPinned} title="当前阶段结论" caption="风险、缺口、候选点与方案比选" />
        <div className="agent-conclusion-grid">
          <ConclusionItem
            title="风险诊断结论"
            value={formatList(asList(diagnosis.highRiskZones).slice(0, 2), "待识别高风险区")}
            evidence={`暴露人口 ${diagnosis.exposedPopulation?.toLocaleString?.() ?? "待计算"}，重点网格 ${formatList(asList(diagnosis.priorityCells).slice(0, 3), "待生成")}`}
          />
          <ConclusionItem
            title="设施缺口结论"
            value={formatList(asList(facilityAudit.facilityGaps).slice(0, 2), "待识别设施缺口")}
            evidence={`覆盖率 ${formatPercent(facilityAudit.coverageRate)}，未覆盖人口 ${facilityAudit.uncoveredPopulation?.toLocaleString?.() ?? "待计算"}，平均步行 ${facilityAudit.avgWalkDistance ?? "待计算"}m`}
          />
          <ConclusionItem
            title="候选点推荐"
            value={formatList(candidateSites.slice(0, 3).map((site) => site.locationName), "待生成候选点")}
            evidence={candidateSites[0]?.evidence?.join("；") ?? "等待候选点证据链"}
          />
          <ConclusionItem
            title="方案比选结果"
            value={selectedScenario?.label ?? report.selectedPlan ?? "待比选"}
            evidence={selectedScenario?.tradeoff ?? report.evidenceSummary ?? "等待 comparePlans 输出推荐方案"}
          />
        </div>
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={ShieldAlert} title="人工核验" caption="Agent 不自动替规划师做最终决策" />
        <div className="agent-manual-review-grid">
          <div>
            <span>现场核验事项</span>
            <ul>
              {asList(manualChecks).slice(0, 5).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <span>数据不确定性</span>
            <ul>
              {asList(report.uncertainty).slice(0, 5).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="agent-manual-review-grid__full">
            <span>不能自动决策</span>
            <p>{formatList(cannotAutoDecide)}</p>
          </div>
        </div>
      </section>

      <section className="agent-workflow-section">
        <SectionHeader icon={GitBranch} title="约束影响" caption="受影响节点与重跑步骤" />
        {constraintImpact ? (
          <div className="agent-constraint-impact">
            <p>{constraintImpact.explanation}</p>
            <div className="agent-constraint-impact__grid">
              <div>
                <span>affectedNodes</span>
                <strong>{formatList((constraintImpact.affectedNodes ?? []).map((node) => node.stepId), "当前约束未命中具体节点")}</strong>
              </div>
              <div>
                <span>needRerunTools</span>
                <strong>{formatList(constraintImpact.needRerunTools, "无需重跑工具")}</strong>
              </div>
              <div>
                <span>preservedResults</span>
                <strong>{formatList(constraintImpact.preservedResults, "暂无可保留结果")}</strong>
              </div>
              <div>
                <span>restartStep</span>
                <strong>{constraintImpact.suggestedRestartStep ?? "由 Replanner 判断"}</strong>
              </div>
            </div>
          </div>
        ) : (
          <p className="agent-empty-note">等待用户新增约束后计算影响范围。</p>
        )}
      </section>

      <section className="agent-workflow-section agent-workflow-section--next">
        <SectionHeader icon={CircleDashed} title="下一步建议" caption="NextStepRecommender" />
        <div className="agent-next-actions">
          {nextSteps.slice(0, 3).map((step, index) => (
            <button
              className="agent-next-action-button"
              key={step}
              type="button"
              onClick={() => onNextStep?.(step)}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
