import { realDataMeta, realToolResults } from "./realDataAdapter.js";

const heatRiskZones = [
  {
    zoneId: "HZ-001",
    name: "学院路-中关村南部高暴露廊道",
    riskLevel: "extreme",
    priorityCell: "H-021",
    reason: "道路热压力高、学校和社区服务设施密集、短时等待活动集中。",
  },
  {
    zoneId: "HZ-002",
    name: "学校周边等待空间",
    riskLevel: "high",
    priorityCell: "H-034",
    reason: "接送学时间刚性强，遮阴和可停留空间不足。",
  },
  {
    zoneId: "HZ-003",
    name: "社区卫生服务站周边",
    riskLevel: "high",
    priorityCell: "H-057",
    reason: "慢病老人就医取药活动集中，午后暴露敏感。",
  },
  {
    zoneId: "HZ-004",
    name: "公交换乘与户外劳动交汇区",
    riskLevel: "medium-high",
    priorityCell: "H-081",
    reason: "配送、巡查和换乘活动重叠，连续道路热暴露较高。",
  },
];

const existingFacilities = [
  { id: "fac-party-01", name: "党群服务中心", type: "清凉驿站", readiness: "high", openingConfidence: "medium" },
  { id: "fac-health-02", name: "社区卫生服务站", type: "休憩+饮水", readiness: "medium", openingConfidence: "low" },
  { id: "fac-culture-03", name: "公共文化空间", type: "临时避暑", readiness: "medium", openingConfidence: "medium" },
  { id: "fac-transit-04", name: "公交站复合候停点", type: "遮阴候停", readiness: "medium", openingConfidence: "medium" },
];

const candidateSites = [
  {
    siteId: "site-school-xueyuan-001",
    locationName: "学院路学校周边等待点",
    priority: 1,
    coveredPopulation: 18600,
    walkDistanceImprovement: 96,
    evidence: ["接送学时间刚性强", "校门口附近绕行容忍低", "道路热暴露等级高"],
    riskLevel: "high",
    feasibility: "medium",
    manualCheck: ["校门周边可布置空间", "不影响通学安全", "遮阴设施权属"],
  },
  {
    siteId: "site-health-community-002",
    locationName: "社区卫生服务站联动点",
    priority: 2,
    coveredPopulation: 14300,
    walkDistanceImprovement: 72,
    evidence: ["慢病老人就医取药频次高", "室内停留可转化", "临近高暴露道路"],
    riskLevel: "medium-high",
    feasibility: "high",
    manualCheck: ["午后开放时间", "室内容量", "饮水与座椅"],
  },
  {
    siteId: "site-party-service-003",
    locationName: "党群服务中心复合点",
    priority: 3,
    coveredPopulation: 12900,
    walkDistanceImprovement: 64,
    evidence: ["公共服务属性强", "具备管理主体", "适合室内清凉驿站"],
    riskLevel: "medium",
    feasibility: "high",
    manualCheck: ["空调条件", "应急开放机制", "运维排班"],
  },
  {
    siteId: "site-bus-stop-004",
    locationName: "公交站复合候停点",
    priority: 4,
    coveredPopulation: 9800,
    walkDistanceImprovement: 48,
    evidence: ["通勤与户外劳动路径重叠", "可降低短时等待暴露", "道路可达性好"],
    riskLevel: "high",
    feasibility: "medium",
    manualCheck: ["市政权属", "道路安全", "后期维护"],
  },
];

export const UnknownTaskType = {
  id: "goal_understanding",
  label: "目标理解",
  defaultTemplateId: "goal_understanding_template",
  typicalQuestions: ["请补充治理目标、空间范围或期望输出"],
  intentKeywords: [],
  requiredData: [],
  outputs: ["补充问题", "可能任务类型", "下一步输入建议"],
  needsClarification: true,
};

export const TaskTypeRegistry = {
  risk_diagnosis: {
    id: "risk_diagnosis",
    label: "风险诊断",
    defaultTemplateId: "risk_diagnosis_template",
    typicalQuestions: ["哪里最热？", "哪些区域高温风险最高？", "哪些人群受高温影响最大？"],
    intentKeywords: ["哪里最热", "哪儿最热", "最热", "高温风险", "风险最高", "影响最大", "受高温影响", "暴露人群", "风险等级", "风险诊断"],
    requiredData: ["lst", "population", "walkingNetwork"],
    outputs: ["高温风险区", "暴露人群", "风险等级"],
  },
  facility_gap_analysis: {
    id: "facility_gap_analysis",
    label: "设施缺口识别",
    defaultTemplateId: "facility_gap_template",
    typicalQuestions: ["哪里最缺清凉设施？", "现有设施覆盖够不够？", "哪些区域15分钟内到不了清凉设施？"],
    intentKeywords: ["哪里最缺", "最缺清凉设施", "缺清凉设施", "覆盖够不够", "覆盖不足", "到不了", "无法到达", "设施缺口", "15分钟", "未覆盖人口", "步行绕行"],
    requiredData: ["existingFacilities", "poi", "walkingNetwork", "population"],
    outputs: ["设施缺口区", "未覆盖人口", "步行绕行距离"],
  },
  candidate_site_generation: {
    id: "candidate_site_generation",
    label: "候选点生成",
    defaultTemplateId: "candidate_site_template",
    typicalQuestions: ["应该在哪里布置清凉设施？", "优先保障老人和接送学家庭，在哪里选点？", "哪些地方适合新增遮阴或饮水设施？"],
    intentKeywords: ["在哪里布置", "在哪布置", "在哪里选点", "在哪选点", "应该在哪里", "适合新增", "新增遮阴", "新增饮水", "候选点", "清凉设施", "布置清凉设施", "推荐点位", "人工核验事项"],
    requiredData: ["lst", "population", "poi", "walkingNetwork", "existingFacilities", "landuse"],
    outputs: ["候选点", "推荐优先级", "推荐理由", "人工核验事项"],
  },
  scenario_comparison: {
    id: "scenario_comparison",
    label: "方案比选",
    defaultTemplateId: "scenario_comparison_template",
    typicalQuestions: ["公平优先和效率优先哪个更好？", "如果新增5个点，覆盖率能提升多少？", "遮阴棚和饮水点哪个优先？"],
    intentKeywords: ["哪个更好", "哪种更好", "新增5个点", "新增五个点", "覆盖率提升", "提升多少", "方案比选", "多方案", "反事实", "公平优先", "效率优先", "哪个优先", "遮阴棚", "饮水点"],
    requiredData: ["existingFacilities", "walkingNetwork", "population"],
    outputs: ["多方案对比", "反事实模拟结果", "推荐方案"],
  },
  constraint_revision: {
    id: "constraint_revision",
    label: "约束调整",
    defaultTemplateId: "candidate_site_template",
    typicalQuestions: ["如果避开学校门口呢？", "如果优先利用社区服务中心呢？", "如果降低成本呢？"],
    intentKeywords: ["如果避开", "避开学校", "避开学校门口", "优先利用", "社区服务中心", "降低成本", "低成本", "调整约束", "新约束", "约束调整", "重算", "新版本"],
    requiredData: ["poi", "walkingNetwork", "landuse"],
    outputs: ["新约束", "受影响步骤", "需要重算的工具", "新版本方案"],
  },
  report_generation: {
    id: "report_generation",
    label: "报告生成",
    defaultTemplateId: "report_generation_template",
    typicalQuestions: ["帮我生成汇报材料", "导出方案说明", "生成审议报告"],
    intentKeywords: ["生成汇报", "汇报材料", "导出方案", "方案说明", "审议报告", "生成报告", "报告", "导出", "证据链", "核验清单", "导出状态"],
    requiredData: ["lst", "population", "poi", "existingFacilities"],
    outputs: ["报告结构", "证据链", "核验清单", "导出状态"],
  },
};

export const ToolRegistry = {
  getHeatRiskZones: {
    toolName: "getHeatRiskZones",
    displayName: "识别高温风险空间单元",
    description: "识别研究区内高温风险等级和高风险空间单元。",
    requiredInputs: ["studyArea", "scenarioDate"],
    optionalInputs: ["lstLayer", "treeCanopyLayer", "waterDistanceLayer"],
    outputs: ["highRiskZones", "riskLevel", "priorityCells"],
    limitations: ["当前为 mock 结果，真实版本需接入 LST、ERA5-Land、树冠和水体距离栅格。"],
    nextPossibleTools: ["getPopulationExposure", "getActivityHotspots", "getFacilityCoverage"],
    mockResult: ({ inputs }) => ({
      studyArea: inputs.studyArea,
      scenarioDate: inputs.scenarioDate,
      highRiskZones: heatRiskZones,
      riskLevel: {
        "HZ-001": "extreme",
        "HZ-002": "high",
        "HZ-003": "high",
        "HZ-004": "medium-high",
      },
      priorityCells: heatRiskZones.map((zone) => zone.priorityCell),
    }),
  },
  getPopulationExposure: {
    toolName: "getPopulationExposure",
    displayName: "计算重点人群热暴露",
    description: "计算重点人群在高温风险区内的暴露情况。",
    requiredInputs: ["highRiskZones", "targetGroups"],
    optionalInputs: ["populationLayer", "activityTimeWindows"],
    outputs: ["exposedPopulation", "groupExposureIndex"],
    limitations: ["缺少真实出行调查时，暴露人群以人口栅格和活动规则估计。"],
    nextPossibleTools: ["getActivityHotspots", "findFacilityGaps"],
    mockResult: ({ inputs }) => ({
      highRiskZoneCount: inputs.highRiskZones?.length ?? heatRiskZones.length,
      targetGroups: inputs.targetGroups,
      exposedPopulation: 128000,
      groupExposureIndex: {
        慢病老人: 0.82,
        接送学家庭: 0.76,
        儿童: 0.71,
        户外劳动者: 0.88,
      },
    }),
  },
  getActivityHotspots: {
    toolName: "getActivityHotspots",
    displayName: "识别居民活动热点",
    description: "识别学校、社区、公交站、公园等活动热点。",
    requiredInputs: ["studyArea", "targetGroups"],
    optionalInputs: ["poiLayer", "landuseLayer"],
    outputs: ["activityHotspots"],
    limitations: ["活动强度为 POI 语义和居民类型规则推断，后续可用轨迹或问卷校准。"],
    nextPossibleTools: ["calculateWalkDistance", "findFacilityGaps"],
    mockResult: () => ({
      activityHotspots: [
        { id: "act-school-01", name: "学校周边接送等待点", type: "school_pickup", group: "接送学家庭" },
        { id: "act-health-02", name: "社区卫生服务站就医取药点", type: "health_visit", group: "慢病老人" },
        { id: "act-bus-03", name: "公交换乘候车点", type: "transit_waiting", group: "户外劳动者" },
        { id: "act-park-04", name: "公园入口短暂停留点", type: "park_access", group: "老人" },
      ],
    }),
  },
  getExistingFacilities: {
    toolName: "getExistingFacilities",
    displayName: "加载既有与可复用设施",
    description: "加载现有清凉设施、公共服务设施和可复用设施点。",
    requiredInputs: ["studyArea", "facilityType"],
    optionalInputs: ["poiLayer", "openingHours"],
    outputs: ["existingFacilities"],
    limitations: ["开放时间、容量、空调条件仍需人工核验或补充数据。"],
    nextPossibleTools: ["getFacilityCoverage", "calculateWalkDistance"],
    mockResult: () => ({ existingFacilities }),
  },
  getFacilityCoverage: {
    toolName: "getFacilityCoverage",
    displayName: "计算设施覆盖率",
    description: "计算现有设施服务范围和覆盖率。",
    requiredInputs: ["existingFacilities", "priorityCells"],
    optionalInputs: ["serviceMinutes", "walkingNetwork"],
    outputs: ["coverageRate", "coveredCells", "uncoveredCells"],
    limitations: ["当前服务范围为 mock，真实版本需基于步行路网等时圈计算。"],
    nextPossibleTools: ["calculateWalkDistance", "findFacilityGaps"],
    mockResult: ({ inputs }) => ({
      facilityCount: inputs.existingFacilities?.length ?? existingFacilities.length,
      coverageRate: 0.64,
      coveredCells: ["H-021", "H-034"],
      uncoveredCells: ["H-057", "H-081", "H-096"],
    }),
  },
  calculateWalkDistance: {
    toolName: "calculateWalkDistance",
    displayName: "计算步行距离与路径压力",
    description: "计算重点人群到最近设施的步行距离。",
    requiredInputs: ["activityHotspots", "existingFacilities"],
    optionalInputs: ["walkingNetwork", "routeHeatExposure"],
    outputs: ["avgWalkDistance", "routePressure"],
    limitations: ["当前路径压力来自 mock 道路热暴露，真实版本需接入逐道路边热暴露。"],
    nextPossibleTools: ["findFacilityGaps", "rankCandidateSites"],
    mockResult: () => ({
      avgWalkDistance: 420,
      routePressure: [
        { routeId: "R-001", name: "老人就医取药", pressure: 0.72 },
        { routeId: "R-002", name: "接送学等待", pressure: 0.78 },
        { routeId: "R-003", name: "户外劳动补给", pressure: 0.81 },
      ],
    }),
  },
  findFacilityGaps: {
    toolName: "findFacilityGaps",
    displayName: "识别设施治理缺口",
    description: "识别高风险但设施覆盖不足的区域。",
    requiredInputs: ["highRiskZones", "coverageRate", "uncoveredCells"],
    optionalInputs: ["groupExposureIndex", "activityHotspots"],
    outputs: ["facilityGaps", "candidateSearchArea"],
    limitations: ["缺口排序仍需开放时间、容量和用地权属核验。"],
    nextPossibleTools: ["generateCandidateSites"],
    mockResult: () => ({
      facilityGaps: [
        "学校周边等待点缺遮阴",
        "高暴露道路饮水点稀疏",
        "慢病老人就医路径缺休憩点",
      ],
      candidateSearchArea: ["学校周边150m", "卫生服务站周边300m", "党群服务中心步行可达区"],
      uncoveredPopulation: 46000,
    }),
  },
  generateCandidateSites: {
    toolName: "generateCandidateSites",
    displayName: "生成候选设施点",
    description: "在设施缺口区生成候选点。",
    requiredInputs: ["facilityGaps", "constraints"],
    optionalInputs: ["candidateSearchArea", "existingFacilities"],
    outputs: ["candidateSites"],
    limitations: ["当前候选点为 mock，真实版本需通过 POI、路网入口、用地边界生成。"],
    nextPossibleTools: ["checkSpatialConstraints", "rankCandidateSites"],
    mockResult: () => ({ candidateSites }),
  },
  checkSpatialConstraints: {
    toolName: "checkSpatialConstraints",
    displayName: "检查空间约束",
    description: "检查候选点是否受学校门口、道路红线、消防通道、权属等约束影响。",
    requiredInputs: ["candidateSites", "constraints"],
    optionalInputs: ["landuseLayer", "roadBoundaryLayer", "ownershipLayer"],
    outputs: ["feasibility", "manualCheck"],
    limitations: ["权属、消防、红线为人工核验项，当前只给出审查清单。"],
    nextPossibleTools: ["rankCandidateSites"],
    mockResult: ({ inputs }) => ({
      feasibility: Object.fromEntries((inputs.candidateSites ?? candidateSites).map((site) => [site.siteId, site.feasibility])),
      manualCheck: [
        "校门口安全距离与人流组织",
        "设施开放时间和室内容量",
        "道路红线、消防通道和权属边界",
      ],
    }),
  },
  rankCandidateSites: {
    toolName: "rankCandidateSites",
    displayName: "候选点评分排序",
    description: "根据公平性、覆盖收益、步行距离改善和可实施性排序。",
    requiredInputs: ["candidateSites", "strategy"],
    optionalInputs: ["groupExposureIndex", "routePressure", "feasibility"],
    outputs: ["rankedSites"],
    limitations: ["权重为产品原型规则，真实版本需结合专家评审或历史项目校准。"],
    nextPossibleTools: ["generateCounterfactualPlan", "exportPlanningReport"],
    mockResult: ({ inputs }) => {
      const strategyOffset = { equity: 0, coverage: 1, reuse: 2, cost: 3 }[inputs.strategy] ?? 0;
      const rankedSites = [...(inputs.candidateSites ?? candidateSites)]
        .map((site, index) => ({
          ...site,
          priority: ((index + strategyOffset) % candidateSites.length) + 1,
          evidence: [...site.evidence, `已按${inputs.strategyLabel ?? "当前策略"}重新排序`],
        }))
        .sort((a, b) => a.priority - b.priority);
      return { rankedSites };
    },
  },
  generateCounterfactualPlan: {
    toolName: "generateCounterfactualPlan",
    displayName: "生成反事实方案",
    description: "生成公平优先、效率优先、低成本优先、应急优先方案。",
    requiredInputs: ["rankedSites", "strategy"],
    optionalInputs: ["budget", "facilityCount"],
    outputs: ["scenarios"],
    limitations: ["当前方案收益为 mock，真实版本需重新计算覆盖率和路径热暴露变化。"],
    nextPossibleTools: ["comparePlans"],
    mockResult: () => ({
      scenarios: {
        fairnessFirst: { label: "公平优先", coverageRate: 0.71, exposedPopulationReduced: 18300, costIndex: 0.68, feasibility: "medium" },
        efficiencyFirst: { label: "效率优先", coverageRate: 0.79, exposedPopulationReduced: 21200, costIndex: 0.76, feasibility: "medium" },
        lowCostFirst: { label: "低成本优先", coverageRate: 0.73, exposedPopulationReduced: 15400, costIndex: 0.42, feasibility: "high" },
        emergencyFirst: { label: "应急优先", coverageRate: 0.68, exposedPopulationReduced: 17100, costIndex: 0.51, feasibility: "high" },
      },
    }),
  },
  comparePlans: {
    toolName: "comparePlans",
    displayName: "比较多策略方案",
    description: "比较不同方案的覆盖率、成本、落地难度和公平性。",
    requiredInputs: ["scenarios"],
    optionalInputs: ["strategy", "priorityGroups"],
    outputs: ["comparisonTable", "recommendedPlan"],
    limitations: ["比较结果为 mock，真实版本需要接入方案成本、实施周期和运维数据。"],
    nextPossibleTools: ["exportPlanningReport"],
    mockResult: ({ inputs }) => ({
      comparisonTable: Object.entries(inputs.scenarios ?? {}).map(([key, scenario]) => ({
        scenarioKey: key,
        label: scenario.label,
        coverageRate: scenario.coverageRate,
        exposedPopulationReduced: scenario.exposedPopulationReduced,
        costIndex: scenario.costIndex,
        feasibility: scenario.feasibility,
      })),
      recommendedPlan: "fairnessFirst",
      reason: "当前治理目标强调老人和接送学家庭，公平优先方案更贴近重点人群保障。",
    }),
  },
  exportPlanningReport: {
    toolName: "exportPlanningReport",
    displayName: "生成规划审议报告",
    description: "生成规划审议报告。",
    requiredInputs: ["AgentState"],
    optionalInputs: ["reportFormat", "audience"],
    outputs: ["report", "manualChecklist", "uncertainty"],
    limitations: ["当前只生成结构化报告草案，正式报告需人工复核证据链和图件。"],
    nextPossibleTools: [],
    mockResult: () => ({
      report: {
        title: "海淀区高温设施规划 Agent 审议草案",
        sections: ["问题背景", "风险诊断", "设施缺口", "候选点生成", "方案比选", "人工核验清单"],
        exportStatus: "draft",
      },
      manualChecklist: [
        "现场核验候选点可布置空间",
        "确认设施开放时间与室内容量",
        "确认管理主体、权属与运维责任",
        "核验道路安全、消防通道与无障碍条件",
      ],
      uncertainty: ["开放时间缺失", "室内容量未核验", "部分路径热暴露仍为 mock"],
    }),
  },
};

Object.entries(realToolResults).forEach(([toolName, realResult]) => {
  const tool = ToolRegistry[toolName];
  if (!tool) return;
  const fallbackResult = tool.mockResult;
  tool.dataSource = realDataMeta;
  tool.limitations = [
    "当前优先使用本地已处理海淀真实数据；开放时间、容量、权属和消防条件仍需人工核验。",
    ...(tool.limitations ?? []),
  ];
  tool.mockResult = (args) => {
    try {
      const output = realResult(args);
      return output ?? (typeof fallbackResult === "function" ? fallbackResult(args) : fallbackResult);
    } catch (error) {
      return {
        ...(typeof fallbackResult === "function" ? fallbackResult(args) : fallbackResult),
        __dataSource: "mock-fallback",
        __fallbackReason: error instanceof Error ? error.message : String(error),
      };
    }
  };
});

const step = (id, title, owner, toolId, output) => ({ id, title, owner, toolId, output });

export const WorkflowTemplateRegistry = {
  risk_diagnosis_template: {
    templateId: "risk_diagnosis_template",
    templateName: "风险诊断模板",
    applicableTaskTypes: ["risk_diagnosis"],
    requiredStateFields: ["project.studyArea", "project.scenarioDate", "project.priorityGroups"],
    steps: [
      step("read_study_area", "读取研究区", "GIS", "getHeatRiskZones", "研究区边界与场景日期"),
      step("load_heat_risk_data", "加载热风险数据", "GIS", "getHeatRiskZones", "热风险栅格与道路热压力"),
      step("identify_high_risk_units", "识别高风险单元", "GIS", "getHeatRiskZones", "高风险区和优先单元"),
      step("overlay_priority_groups", "叠加重点人群", "GIS + Rule", "getPopulationExposure", "重点人群暴露强度"),
      step("output_risk_conclusion", "输出风险结论", "Rule", "exportPlanningReport", "风险诊断摘要"),
    ],
    requiredTools: ["getHeatRiskZones", "getPopulationExposure", "exportPlanningReport"],
    outputs: ["高温风险区", "暴露人群", "风险等级"],
    nextStepSuggestion: "进入设施缺口识别，判断现有清凉设施是否覆盖高风险活动空间。",
  },
  facility_gap_template: {
    templateId: "facility_gap_template",
    templateName: "设施缺口模板",
    applicableTaskTypes: ["facility_gap_analysis"],
    requiredStateFields: ["diagnosis.highRiskZones", "facilityAudit.existingFacilities"],
    steps: [
      step("read_risk_diagnosis", "读取风险诊断结果", "Agent Memory", "getHeatRiskZones", "高风险区"),
      step("load_existing_facilities", "加载现有设施点", "GIS", "getExistingFacilities", "现有设施与可复用设施"),
      step("calculate_service_area", "计算服务范围", "GIS", "getFacilityCoverage", "覆盖率和未覆盖单元"),
      step("identify_uncovered_area", "识别未覆盖区域", "GIS + Rule", "findFacilityGaps", "设施缺口区"),
      step("output_gap_ranking", "输出缺口排序", "Rule", "findFacilityGaps", "缺口优先级"),
    ],
    requiredTools: ["getHeatRiskZones", "getExistingFacilities", "getFacilityCoverage", "findFacilityGaps"],
    outputs: ["设施缺口区", "未覆盖人口", "步行绕行距离"],
    nextStepSuggestion: "将设施缺口区转入候选点生成。",
  },
  candidate_site_template: {
    templateId: "candidate_site_template",
    templateName: "候选点生成模板",
    applicableTaskTypes: ["candidate_site_generation", "constraint_revision"],
    requiredStateFields: ["facilityAudit.facilityGaps", "project.constraints", "candidateSites"],
    steps: [
      step("read_facility_gap", "读取设施缺口", "Agent Memory", "findFacilityGaps", "缺口区与搜索范围"),
      step("read_constraints", "读取约束条件", "Rule", "checkSpatialConstraints", "空间约束"),
      step("generate_candidate_sites", "生成候选点", "GIS + Rule", "generateCandidateSites", "候选点集合"),
      step("spatial_conflict_check", "空间冲突检查", "GIS + Rule", "checkSpatialConstraints", "可实施性和人工核验"),
      step("score_candidate_sites", "候选点评分排序", "Rule", "rankCandidateSites", "排序后的候选点"),
      step("output_recommended_plan", "输出推荐方案", "LLM + Rule", "exportPlanningReport", "推荐方案和核验清单"),
    ],
    requiredTools: ["findFacilityGaps", "generateCandidateSites", "checkSpatialConstraints", "rankCandidateSites", "exportPlanningReport"],
    outputs: ["候选点", "推荐优先级", "推荐理由", "人工核验事项"],
    nextStepSuggestion: "进入反事实方案比选，评估不同策略的覆盖收益和实施难度。",
  },
  scenario_comparison_template: {
    templateId: "scenario_comparison_template",
    templateName: "方案比选模板",
    applicableTaskTypes: ["scenario_comparison"],
    requiredStateFields: ["candidateSites", "scenarios"],
    steps: [
      step("read_candidate_set", "读取候选点集合", "Agent Memory", "rankCandidateSites", "候选点集合"),
      step("generate_multi_strategy_plans", "生成多策略方案", "Rule", "generateCounterfactualPlan", "四类策略方案"),
      step("calculate_coverage_gain", "计算覆盖收益", "GIS", "generateCounterfactualPlan", "覆盖率提升"),
      step("calculate_implementation_difficulty", "计算实施难度", "Rule", "comparePlans", "成本和可实施性"),
      step("compare_equity_efficiency_cost", "比较公平性、效率和成本", "Rule", "comparePlans", "方案比选表"),
      step("output_recommended_plan", "输出推荐方案", "LLM + Rule", "exportPlanningReport", "推荐结论"),
    ],
    requiredTools: ["rankCandidateSites", "generateCounterfactualPlan", "comparePlans", "exportPlanningReport"],
    outputs: ["多方案对比", "反事实模拟结果", "推荐方案"],
    nextStepSuggestion: "选择一个方案进入人工核验或导出审议报告。",
  },
  report_generation_template: {
    templateId: "report_generation_template",
    templateName: "报告生成模板",
    applicableTaskTypes: ["report_generation"],
    requiredStateFields: ["diagnosis", "facilityAudit", "candidateSites", "scenarios"],
    steps: [
      step("summarize_project_background", "汇总项目背景", "LLM + Rule", "exportPlanningReport", "项目背景"),
      step("summarize_analysis_goal", "汇总分析目标", "LLM + Rule", "exportPlanningReport", "分析目标"),
      step("summarize_risk_diagnosis", "汇总风险诊断", "LLM + Rule", "exportPlanningReport", "风险诊断"),
      step("summarize_facility_audit", "汇总设施核验", "LLM + Rule", "exportPlanningReport", "设施核验"),
      step("summarize_candidate_sites", "汇总候选点", "LLM + Rule", "exportPlanningReport", "候选点"),
      step("summarize_scenario_comparison", "汇总方案比选", "LLM + Rule", "exportPlanningReport", "方案比选"),
      step("generate_manual_checklist", "生成核验清单", "LLM + Rule", "exportPlanningReport", "人工核验清单"),
      step("output_report", "输出报告", "LLM + Rule", "exportPlanningReport", "报告草案"),
    ],
    requiredTools: ["exportPlanningReport"],
    outputs: ["报告结构", "证据链", "核验清单", "导出状态"],
    nextStepSuggestion: "检查报告证据链并补充人工复核结论。",
  },
  goal_understanding_template: {
    templateId: "goal_understanding_template",
    templateName: "目标理解模板",
    applicableTaskTypes: ["goal_understanding"],
    requiredStateFields: ["intent.rawUserInput"],
    steps: [
      step("clarification", "提示补充治理目标", "LLM", "exportPlanningReport", "补充问题"),
    ],
    requiredTools: ["exportPlanningReport"],
    outputs: ["补充问题", "可能任务类型", "下一步输入建议"],
    nextStepSuggestion: "补充任务对象、研究区、重点人群或期望输出。",
  },
};
