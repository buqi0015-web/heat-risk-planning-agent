import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  GitCompare,
  Layers3,
  LocateFixed,
  MapPin,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Trees,
  Users,
} from "lucide-react";

const cleanTaskLabels = {
  risk_diagnosis: "风险诊断",
  facility_gap_analysis: "设施缺口识别",
  candidate_site_generation: "候选点推荐",
  scenario_comparison: "方案比选",
  constraint_revision: "约束调整",
  report_generation: "报告生成",
  goal_understanding: "目标理解",
};

const strategyLabels = {
  equity: "公平优先",
  coverage: "覆盖优先",
  reuse: "存量复用优先",
  cost: "低成本优先",
  efficiency: "效率优先",
};

const siteNameFallbacks = [
  "学校周边等候清凉点",
  "社区卫生服务站联动点",
  "党群服务中心复合点",
  "公交站复合候停点",
  "老旧社区口袋遮阴点",
];

const evidenceFallbacks = [
  ["接送学等待时间集中", "高温暴露等级高", "步行绕行容忍度低"],
  ["老人就医取药频次高", "室内停留条件较好", "可联动健康服务"],
  ["公共服务属性强", "具备管理主体", "适合快速开放"],
  ["通勤与户外劳动路径重叠", "短时等待暴露高", "道路可达性好"],
  ["老旧社区设施不足", "邻近高风险单元", "便于补齐服务缺口"],
];

const scenarioDisplay = [
  {
    key: "fairnessFirst",
    label: "公平优先",
    coverage: "71%",
    population: "1.83 万",
    walk: "-96m",
    difficulty: "中",
    score: "A",
    tradeoff: "优先保障老人、儿童接送家庭等热脆弱人群，适合首轮审议。",
  },
  {
    key: "efficiencyFirst",
    label: "效率优先",
    coverage: "79%",
    population: "2.12 万",
    walk: "-82m",
    difficulty: "中高",
    score: "B+",
    tradeoff: "整体覆盖提升更快，但重点人群精准性略低。",
  },
  {
    key: "lowCostFirst",
    label: "低成本优先",
    coverage: "73%",
    population: "1.54 万",
    walk: "-61m",
    difficulty: "低",
    score: "B",
    tradeoff: "优先复用存量公共服务设施，落地阻力较低。",
  },
  {
    key: "emergencyFirst",
    label: "应急优先",
    coverage: "68%",
    population: "1.71 万",
    walk: "-74m",
    difficulty: "低",
    score: "B+",
    tradeoff: "适合短期响应高温预警，长期运维机制需补充。",
  },
];

const navItems = [
  { id: "spatial", label: "空间分析", icon: Layers3, target: "client-spatial" },
  { id: "scenario", label: "方案比选", icon: GitCompare, target: "client-scenarios" },
  { id: "checklist", label: "核验清单", icon: ClipboardCheck, target: "client-evidence" },
  { id: "report", label: "审议报告", icon: FileText, target: "client-report" },
];

const defaultLayerItems = [
  { id: "risk", label: "高温风险", color: "#ff8a5b", active: true },
  { id: "gap", label: "设施缺口", color: "#f6c453", active: true },
  { id: "site", label: "候选点", color: "#1e9b8a", active: true },
  { id: "group", label: "重点人群", color: "#59b6d7", active: false },
];

function formatPopulation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "12.8 万";
  return `${(numeric / 10000).toFixed(1)} 万`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "68%";
  return `${Math.round(numeric * 100)}%`;
}

function asCleanTaskType(agentState) {
  const taskType = agentState.intent?.taskType ?? "candidate_site_generation";
  return cleanTaskLabels[taskType] ?? "目标理解";
}

function cleanSites(agentState) {
  const sites = agentState.candidateSites?.length ? agentState.candidateSites : [];
  return (sites.length ? sites : siteNameFallbacks.map((name, index) => ({
    priority: index + 1,
    coveredPopulation: 9000 + index * 1800,
    walkDistanceImprovement: 42 + index * 12,
  })))
    .slice(0, 5)
    .map((site, index) => ({
      ...site,
      displayName: siteNameFallbacks[index] ?? site.locationName ?? `候选点 ${index + 1}`,
      evidence: evidenceFallbacks[index] ?? ["高风险区重叠", "设施服务不足", "具备落地条件"],
      feasibilityLabel: site.feasibility === "high" ? "高可行" : "需核验",
    }));
}

function MetricCard({ icon: Icon, label, value, note, tone = "mint" }) {
  return (
    <article className={`client-metric client-metric--${tone}`}>
      <span className="client-metric__icon"><Icon size={18} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

function LayerSidebar({
  activeNav,
  setActiveNav,
  layers,
  onToggleLayer,
  activeVersion,
  setActiveVersion,
  setToast,
}) {
  return (
    <aside className="client-left-rail">
      <div className="client-brand">
        <span><ThermometerSun size={21} /></span>
        <div>
          <strong>高温设施规划</strong>
          <small>Planning Agent</small>
        </div>
      </div>

      <nav className="client-nav" aria-label="客户展示导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            className={activeNav === id ? "client-nav__item client-nav__item--active" : "client-nav__item"}
            key={id}
            type="button"
            onClick={() => {
              setActiveNav(id);
              setToast(`${label} 工作区已打开`);
            }}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="client-layer-box">
        <span>空间图层</span>
        {layers.map((item) => (
          <label key={item.id} className={item.active ? "client-layer-row client-layer-row--active" : "client-layer-row"}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={item.active}
              onChange={() => onToggleLayer(item.id)}
            />
          </label>
        ))}
      </div>

      <div className="client-version-box">
        <span>方案版本</span>
        {[
          ["v1", "V1 公平优先方案"],
          ["v2", "V2 避开学校门口"],
        ].map(([id, label]) => (
          <button
            className={activeVersion === id ? "client-version-button client-version-button--active" : "client-version-button"}
            key={id}
            type="button"
            onClick={() => {
              setActiveVersion(id);
              setToast(`${label} 已切换`);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
}

function SummerMap({ sites, layers, selectedSiteIndex, setSelectedSiteIndex, setToast }) {
  const visible = Object.fromEntries(layers.map((item) => [item.id, item.active]));
  const selectedSite = sites[selectedSiteIndex];

  return (
    <section className="client-map-card" id="client-spatial">
      <div className="client-section-head">
        <div>
          <span>空间证据</span>
          <h2>高温风险、设施缺口与候选点叠加</h2>
        </div>
        <button
          className="client-icon-button"
          type="button"
          aria-label="定位研究区"
          onClick={() => {
            setSelectedSiteIndex(0);
            setToast("已定位到滨水老城区重点缺口片区");
          }}
        >
          <LocateFixed size={17} />
        </button>
      </div>

      <div className="client-map">
        <div className="client-map__grid" />
        <div className="client-map__water client-map__water--one" />
        <div className="client-map__water client-map__water--two" />
        <div className="client-map__road client-map__road--one" />
        <div className="client-map__road client-map__road--two" />
        <div className="client-map__road client-map__road--three" />

        {visible.risk ? (
          <>
            <div className="client-risk-zone client-risk-zone--one"><span>高风险</span></div>
            <div className="client-risk-zone client-risk-zone--three"><span>等候暴露</span></div>
          </>
        ) : null}
        {visible.gap ? <div className="client-risk-zone client-risk-zone--two"><span>缺口区</span></div> : null}
        <div className="client-cool-area client-cool-area--one"><Trees size={16} />公园冷区</div>
        <div className="client-cool-area client-cool-area--two"><ShieldCheck size={16} />可复用设施</div>
        {visible.group ? (
          <>
            <div className="client-group-dot client-group-dot--one">老人活动</div>
            <div className="client-group-dot client-group-dot--two">接送学</div>
          </>
        ) : null}

        {visible.site ? sites.slice(0, 4).map((site, index) => (
          <button
            className={selectedSiteIndex === index ? `client-site-pin client-site-pin--${index + 1} client-site-pin--active` : `client-site-pin client-site-pin--${index + 1}`}
            key={site.displayName}
            type="button"
            aria-label={site.displayName}
            onClick={() => {
              setSelectedSiteIndex(index);
              setToast(`已选中：${site.displayName}`);
            }}
          >
            <MapPin size={16} />
            <span>{index + 1}</span>
          </button>
        )) : null}

        {selectedSite ? (
          <div className="client-map-inspector">
            <span>当前候选点</span>
            <strong>{selectedSite.displayName}</strong>
            <p>{selectedSite.evidence.slice(0, 2).join(" / ")}</p>
          </div>
        ) : null}

        <div className="client-map__legend">
          {layers.map((item) => (
            <span className={!item.active ? "client-legend-muted" : ""} key={item.id}>
              <i style={{ background: item.color }} />{item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentWorkflowPanel({
  agentState,
  goal,
  setGoal,
  strategy,
  setStrategy,
  onRunGoal,
  selectedScenario,
  setSelectedScenario,
  setActiveNav,
  setReportReady,
  setToast,
}) {
  const taskType = asCleanTaskType(agentState);
  const latestCalls = agentState.workflow?.latestRunToolCallHistory?.length ?? 0;
  const completedCount = latestCalls > 8 ? 4 : 3;
  const flow = [
    { label: "目标理解", summary: `识别为${taskType}，聚焦老人、接送学家庭等重点人群。`, status: "done" },
    { label: "前置检查", summary: "研究区、现有设施和重点人群数据已具备，仍需现场核验开放条件。", status: "done" },
    { label: "空间分析", summary: "叠加高温风险、活动热点、设施覆盖与步行可达性。", status: latestCalls > 2 ? "done" : "active" },
    { label: "候选点推荐", summary: "生成学校周边、社区服务站、党群中心等优先点位。", status: latestCalls > 6 ? "active" : "pending" },
    { label: "方案比选", summary: "比较公平、效率、低成本与应急四类方案。", status: selectedScenario ? "done" : "pending" },
    { label: "人工核验", summary: "输出权属、开放时间、安全影响与运维主体清单。", status: "pending" },
  ];

  const runGoal = () => {
    onRunGoal?.();
    setToast("Agent 已重新生成方案");
  };

  return (
    <aside className="client-agent-panel">
      <div className="client-agent-panel__top">
        <span><Sparkles size={15} />规划智能体</span>
        <strong>{strategyLabels[strategy] ?? "公平优先"}</strong>
      </div>

      <section className="client-goal-entry">
        <label htmlFor="client-goal">治理目标入口</label>
        <textarea
          id="client-goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={3}
        />
        <div className="client-goal-entry__actions">
          <select value={strategy} onChange={(event) => setStrategy(event.target.value)} aria-label="策略偏好">
            <option value="equity">公平优先</option>
            <option value="efficiency">效率优先</option>
            <option value="cost">低成本优先</option>
            <option value="reuse">存量复用优先</option>
          </select>
          <button type="button" onClick={runGoal}><Search size={15} />生成方案</button>
        </div>
      </section>

      <section className="client-intent-card">
        <span>目标理解</span>
        <div>
          <strong>任务类型</strong>
          <p>{taskType}</p>
        </div>
        <div>
          <strong>重点人群</strong>
          <p>老人、儿童接送家庭、户外劳动者</p>
        </div>
        <div>
          <strong>规划对象</strong>
          <p>遮阴、饮水、休憩与清凉驿站</p>
        </div>
      </section>

      <section className="client-workflow">
        <div className="client-subhead">
          <span>分析进度</span>
          <b>{completedCount}/{flow.length}</b>
        </div>
        {flow.map((step, index) => (
          <article className={`client-flow-step client-flow-step--${step.status}`} key={step.label}>
            <i>{index + 1}</i>
            <div>
              <strong>{step.label}</strong>
              <p>{step.summary}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="client-next-card">
        <span>下一步建议</span>
        <button
          type="button"
          onClick={() => {
            setSelectedScenario("fairnessFirst");
            setActiveNav("scenario");
            setToast("已进入方案比选，并选中公平优先方案");
          }}
        >
          进入方案比选 <ArrowRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            setReportReady(true);
            setActiveNav("report");
            setToast("审议报告草稿已生成");
          }}
        >
          生成审议报告 <ArrowRight size={14} />
        </button>
      </section>
    </aside>
  );
}

function CandidateList({ sites, selectedSiteIndex, setSelectedSiteIndex, setToast }) {
  return (
    <section className="client-site-list">
      <div className="client-section-head">
        <div>
          <span>候选点推荐</span>
          <h2>优先补足学校周边、老旧社区与换乘节点</h2>
        </div>
      </div>
      <div className="client-site-list__grid">
        {sites.slice(0, 4).map((site, index) => (
          <button
            className={selectedSiteIndex === index ? "client-site-card client-site-card--active" : "client-site-card"}
            key={site.displayName}
            type="button"
            onClick={() => {
              setSelectedSiteIndex(index);
              setToast(`候选点已切换为：${site.displayName}`);
            }}
          >
            <div>
              <b>优先级 {index + 1}</b>
              <strong>{site.displayName}</strong>
              <small>{site.feasibilityLabel}</small>
            </div>
            <dl>
              <div><dt>覆盖人口</dt><dd>{formatPopulation(site.coveredPopulation)}</dd></div>
              <div><dt>步行改善</dt><dd>{site.walkDistanceImprovement ?? 72}m</dd></div>
            </dl>
            <p>{site.evidence.join(" / ")}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScenarioBoard({ agentState, selectedScenario, setSelectedScenario, setToast }) {
  return (
    <section className="client-review-board" id="client-scenarios">
      <div className="client-section-head">
        <div>
          <span>方案审议</span>
          <h2>四类策略比选与推荐方案</h2>
        </div>
        <button
          type="button"
          className="client-primary-button"
          onClick={() => setToast("核验清单已生成，可进入审议报告模块查看")}
        >
          <Download size={15} />导出核验清单
        </button>
      </div>
      <div className="client-scenario-grid">
        {scenarioDisplay.map((scenario) => {
          const data = agentState.scenarios?.[scenario.key];
          const active = selectedScenario === scenario.key;
          return (
            <button
              className={active ? "client-scenario client-scenario--recommended" : "client-scenario"}
              key={scenario.key}
              type="button"
              onClick={() => {
                setSelectedScenario(scenario.key);
                setToast(`已选中${scenario.label}方案`);
              }}
            >
              {active ? <em>当前方案</em> : null}
              <strong>{scenario.label}</strong>
              <div className="client-scenario__metrics">
                <span><b>{data ? formatPercent(data.coverageRate) : scenario.coverage}</b>覆盖率</span>
                <span><b>{data ? formatPopulation(data.exposedPopulationReduced) : scenario.population}</b>减少暴露</span>
                <span><b>{scenario.walk}</b>步行改善</span>
              </div>
              <p>{scenario.tradeoff}</p>
              <footer>
                <span>实施难度：{scenario.difficulty}</span>
                <span>评分：{scenario.score}</span>
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EvidencePanel({ reportReady }) {
  const checklist = [
    "候选点可布设空间与权属边界",
    "学校门口、消防通道与道路安全影响",
    "开放时间、室内容量和运维主体",
    "饮水、座椅、遮阴设施的维护责任",
  ];
  const uncertainty = [
    "开放时间需要街道与设施方确认",
    "部分活动路径仍为模拟样本",
    "微观遮阴条件需要现场复核",
  ];

  return (
    <section className="client-evidence-panel" id="client-evidence">
      <div>
        <span>推荐依据</span>
        <p>结合高温风险、重点人群、活动热点、设施覆盖和存量复用条件进行推荐。</p>
      </div>
      <div>
        <span>现场核验事项</span>
        <ul>{checklist.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <span>数据不确定性</span>
        <ul>{uncertainty.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div className={reportReady ? "client-report-card client-report-card--ready" : "client-report-card"} id="client-report">
        <span>审议报告</span>
        <strong>{reportReady ? "报告草稿已生成" : "等待生成报告"}</strong>
        <p>{reportReady ? "已汇总项目背景、分析目标、候选点、方案比选、证据摘要和人工核验清单。" : "点击右侧“生成审议报告”后，将汇总当前方案和核验事项。"}</p>
      </div>
    </section>
  );
}

function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="client-page-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children ? <div className="client-page-header__action">{children}</div> : null}
    </header>
  );
}

function SpatialWorkspace({
  sites,
  layers,
  selectedSiteIndex,
  setSelectedSiteIndex,
  setToast,
}) {
  return (
    <div className="client-workspace client-spatial-page">
      <PageHeader
        eyebrow="空间分析工作区"
        title="先判断哪里风险高、哪里服务不足、哪里值得优先布点"
        description="当前页只展示空间证据和候选点建议，适合给客户解释为什么这些位置进入优先清单。"
      />
      <div className="client-dashboard-split">
        <SummerMap
          sites={sites}
          layers={layers}
          selectedSiteIndex={selectedSiteIndex}
          setSelectedSiteIndex={setSelectedSiteIndex}
          setToast={setToast}
        />
        <div className="client-insight-stack">
          <article className="client-page-card client-page-card--mint">
            <span><MapPin size={15} /> 当前推荐</span>
            <strong>{sites[selectedSiteIndex]?.displayName ?? "候选点待生成"}</strong>
            <p>{sites[selectedSiteIndex]?.evidence?.slice(0, 2).join(" / ") ?? "等待 Agent 完成空间分析。"}</p>
          </article>
          <article className="client-page-card">
            <span><Trees size={15} /> 客户可见结论</span>
            <strong>优先补齐老人、接送学家庭与换乘人群的高温暴露缺口</strong>
            <p>地图中只保留风险、缺口、候选点和重点人群四类业务图层，避免把工具细节直接暴露给客户。</p>
          </article>
        </div>
      </div>
      <CandidateList
        sites={sites}
        selectedSiteIndex={selectedSiteIndex}
        setSelectedSiteIndex={setSelectedSiteIndex}
        setToast={setToast}
      />
    </div>
  );
}

function ScenarioWorkspace({
  agentState,
  selectedScenario,
  setSelectedScenario,
  setToast,
}) {
  const selected = scenarioDisplay.find((scenario) => scenario.key === selectedScenario) ?? scenarioDisplay[0];
  return (
    <div className="client-workspace client-scenario-page">
      <PageHeader
        eyebrow="方案比选工作区"
        title="把推荐点位转成可审议的策略方案"
        description="客户在这一页只需要理解不同策略的取舍：公平、效率、成本、应急响应各自带来什么结果。"
      >
        <button
          type="button"
          className="client-primary-button"
          onClick={() => setToast("已生成方案比选摘要")}
        >
          <GitCompare size={15} />生成比选摘要
        </button>
      </PageHeader>
      <ScenarioBoard
        agentState={agentState}
        selectedScenario={selectedScenario}
        setSelectedScenario={setSelectedScenario}
        setToast={setToast}
      />
      <section className="client-scenario-detail">
        <article className="client-page-card client-page-card--mint">
          <span>当前选中方案</span>
          <strong>{selected.label}</strong>
          <p>{selected.tradeoff}</p>
        </article>
        <article className="client-page-card">
          <span>适合展示给客户的判断</span>
          <strong>推荐先用公平优先方案进入审议，再根据现场核验调整落点</strong>
          <p>比选页不展示底层工具链，只展示覆盖收益、步行改善、实施难度和人工核验影响。</p>
        </article>
      </section>
    </div>
  );
}

function ChecklistWorkspace({ reportReady }) {
  return (
    <div className="client-workspace client-checklist-page">
      <PageHeader
        eyebrow="人工核验工作区"
        title="把 Agent 不能自动决定的事项交给规划师确认"
        description="这里保留证据摘要、现场核验清单和不确定性说明，避免客户误以为系统已经替代专业审查。"
      />
      <div className="client-checklist-layout">
        <EvidencePanel reportReady={reportReady} />
        <aside className="client-review-notes">
          <article className="client-page-card client-page-card--sun">
            <span><ClipboardCheck size={15} /> 核验优先级</span>
            <strong>先核验权属与安全边界，再核验开放时间和运维主体</strong>
            <p>这些事项会直接影响候选点是否能进入正式方案。</p>
          </article>
          <article className="client-page-card">
            <span>对客户的表达</span>
            <strong>系统给出推荐，不替代现场判断</strong>
            <p>客户侧界面只呈现需要确认的事项，不展示工具失败、字段缺失等开发态信息。</p>
          </article>
        </aside>
      </div>
    </div>
  );
}

function ReportWorkspace({ reportReady, setReportReady, setToast, selectedScenario }) {
  const selected = scenarioDisplay.find((scenario) => scenario.key === selectedScenario) ?? scenarioDisplay[0];
  return (
    <div className="client-workspace client-report-page">
      <PageHeader
        eyebrow="审议报告工作区"
        title="汇总成可对外沟通的方案说明"
        description="报告页只放项目结论、证据链摘要、推荐方案和待核验事项，适合后续导出为汇报材料。"
      >
        <button
          type="button"
          className="client-primary-button"
          onClick={() => {
            setReportReady(true);
            setToast("审议报告草稿已生成");
          }}
        >
          <FileText size={15} />生成报告草稿
        </button>
      </PageHeader>
      <section className={reportReady ? "client-report-preview client-report-preview--ready" : "client-report-preview"}>
        <div className="client-report-preview__cover">
          <span>Heat Facility Planning Agent</span>
          <h2>滨水老城区清凉设施补足方案</h2>
          <p>{reportReady ? "报告草稿已汇总当前方案、空间证据、比选结论与人工核验清单。" : "点击生成后，Agent 会把当前工作区结果汇总为审议报告草稿。"}</p>
        </div>
        <div className="client-report-preview__sections">
          {[
            ["推荐方案", selected.label],
            ["核心依据", "高温风险、设施缺口、重点人群暴露、步行可达性"],
            ["人工核验", "权属边界、安全影响、开放时间、运维主体"],
            ["导出状态", reportReady ? "草稿已生成" : "等待生成"],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkspaceContent({
  activeNav,
  agentState,
  sites,
  layers,
  selectedSiteIndex,
  setSelectedSiteIndex,
  selectedScenario,
  setSelectedScenario,
  reportReady,
  setReportReady,
  setToast,
}) {
  if (activeNav === "scenario") {
    return (
      <ScenarioWorkspace
        agentState={agentState}
        selectedScenario={selectedScenario}
        setSelectedScenario={setSelectedScenario}
        setToast={setToast}
      />
    );
  }

  if (activeNav === "checklist") {
    return <ChecklistWorkspace reportReady={reportReady} />;
  }

  if (activeNav === "report") {
    return (
      <ReportWorkspace
        reportReady={reportReady}
        setReportReady={setReportReady}
        setToast={setToast}
        selectedScenario={selectedScenario}
      />
    );
  }

  return (
    <SpatialWorkspace
      sites={sites}
      layers={layers}
      selectedSiteIndex={selectedSiteIndex}
      setSelectedSiteIndex={setSelectedSiteIndex}
      setToast={setToast}
    />
  );
}

export function ClientPlanningCockpit({
  agentState,
  goal,
  setGoal,
  strategy,
  setStrategy,
  onRunGoal,
}) {
  const [activeNav, setActiveNav] = useState("spatial");
  const [layers, setLayers] = useState(defaultLayerItems);
  const [activeVersion, setActiveVersion] = useState("v1");
  const [selectedSiteIndex, setSelectedSiteIndex] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState("fairnessFirst");
  const [reportReady, setReportReady] = useState(false);
  const [toast, setToast] = useState("已加载公平优先候选方案");

  const sites = useMemo(() => cleanSites(agentState), [agentState]);
  const coverage = formatPercent(agentState.facilityAudit?.coverageRate);
  const exposedPopulation = formatPopulation(agentState.diagnosis?.exposedPopulation);
  const uncoveredPopulation = formatPopulation(agentState.facilityAudit?.uncoveredPopulation);
  const avgWalkDistance = agentState.facilityAudit?.avgWalkDistance ?? 420;

  const onToggleLayer = (layerId) => {
    setLayers((current) => current.map((item) => (
      item.id === layerId ? { ...item, active: !item.active } : item
    )));
    const layer = layers.find((item) => item.id === layerId);
    setToast(`${layer?.label ?? "图层"}已切换`);
  };

  return (
    <div className="client-shell">
      <LayerSidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        layers={layers}
        onToggleLayer={onToggleLayer}
        activeVersion={activeVersion}
        setActiveVersion={setActiveVersion}
        setToast={setToast}
      />
      <main id="main-content" className="client-main">
        <header className="client-topbar">
          <div>
            <span>高温设施规划 Agent</span>
            <strong>滨水老城区清凉设施补足方案</strong>
          </div>
          <div className="client-topbar__meta">
            <span>研究区：滨水老城区</span>
            <span>情景日期：2026-07-15</span>
            <span>策略：{strategyLabels[strategy] ?? "公平优先"}</span>
          </div>
        </header>

        <section className="client-brief">
          <div>
            <span>客户展示版空间规划驾驶舱</span>
            <h1>高温设施布局方案</h1>
            <p>从治理目标出发，按目标理解、前置检查、空间分析、候选点推荐、方案比选和人工核验组织结果。</p>
          </div>
          <div className="client-brief__status">
            <strong>当前结论</strong>
            <p>优先补足学校周边、老旧社区与公交换乘节点附近的清凉设施缺口。</p>
          </div>
        </section>

        <section className="client-metric-grid">
          <MetricCard icon={ThermometerSun} label="暴露人口" value={exposedPopulation} note="高温风险区内重点人群估计" tone="risk" />
          <MetricCard icon={ShieldCheck} label="现有覆盖率" value={coverage} note="15 分钟可达清凉设施" tone="mint" />
          <MetricCard icon={Users} label="未覆盖人口" value={uncoveredPopulation} note="服务不足区域人口估计" tone="sun" />
          <MetricCard icon={Route} label="平均步行距离" value={`${avgWalkDistance}m`} note="到最近清凉设施的距离" tone="blue" />
        </section>

        <section className="client-workspace-grid">
          <div className="client-page-main">
            <WorkspaceContent
              activeNav={activeNav}
              agentState={agentState}
              sites={sites}
              layers={layers}
              selectedSiteIndex={selectedSiteIndex}
              setSelectedSiteIndex={setSelectedSiteIndex}
              selectedScenario={selectedScenario}
              setSelectedScenario={setSelectedScenario}
              reportReady={reportReady}
              setReportReady={setReportReady}
              setToast={setToast}
            />
          </div>
          <div className="client-cockpit-side">
            <AgentWorkflowPanel
              agentState={agentState}
              goal={goal}
              setGoal={setGoal}
              strategy={strategy}
              setStrategy={setStrategy}
              onRunGoal={onRunGoal}
              selectedScenario={selectedScenario}
              setSelectedScenario={setSelectedScenario}
              setActiveNav={setActiveNav}
              setReportReady={setReportReady}
              setToast={setToast}
            />
          </div>
        </section>

        <div className="client-toast" role="status">
          <CheckCircle2 size={14} />
          <span>{toast}</span>
        </div>
      </main>
    </div>
  );
}
