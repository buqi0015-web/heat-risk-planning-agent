const timestamp = () => new Date().toISOString();

export const mockGisInterfaces = {
  heatRiskLayer: {
    status: "mock",
    adapter: "getHeatRiskZones",
    replaceWith: "真实 LST/ERA5-Land/树冠/水体距离栅格服务",
  },
  populationExposure: {
    status: "mock",
    adapter: "getPopulationExposure",
    replaceWith: "真实人口栅格、重点人群画像与活动时段接口",
  },
  walkNetwork: {
    status: "mock",
    adapter: "calculateWalkDistance",
    replaceWith: "真实 OSM/步行路网等时圈与路径暴露计算服务",
  },
  facilityInventory: {
    status: "mock",
    adapter: "getExistingFacilities",
    replaceWith: "真实 POI、设施开放时间、容量与权属台账",
  },
};

export const mockCandidateSites = [
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

export const mockActivityCases = [
  {
    person: "慢病老人",
    time: "09:30-11:00",
    activity: "就医、取药、买菜",
    constraint: "步速慢、热脆弱性高、目的地停留不可压缩",
    behavior: "倾向选择熟悉路径，绕行容忍低于 300m",
    planning: "医疗点和菜市场周边需要可进入休憩点",
  },
  {
    person: "接送学家庭",
    time: "15:30-17:30",
    activity: "接送学、等待、短距离步行",
    constraint: "时间刚性强，停留位置由校门和等待区决定",
    behavior: "即使经过清凉设施，也可能因接送任务不进入",
    planning: "学校周边要优先补遮阴等待和短时座椅",
  },
  {
    person: "户外劳动者",
    time: "11:00-16:00",
    activity: "配送、巡查、保洁",
    constraint: "路线连续、任务密集，暴露时间随订单或巡查段累积",
    behavior: "更需要沿途低成本短暂停留，不依赖目的地休憩",
    planning: "高暴露道路边需要饮水点和短停节点",
  },
];

export const mockActivityRoutes = [
  {
    id: "agent_000050_act_02",
    label: "老人陪医取药",
    origin: "北京市海淀医院",
    destination: "中医医院采样点",
    time: "11:37",
    distance: "7.3km",
    exposure: "198.7",
    failed: "目的地停留热暴露高",
    adjustment: "增加卫生服务站联动休憩点，路径优先经过遮阴道路",
  },
  {
    id: "agent_000074_act_01",
    label: "接送学陪护",
    origin: "乘服公寓",
    destination: "风车汇智学校",
    time: "10:46",
    distance: "1.5km",
    exposure: "72.7",
    failed: "学校周边等待暴露",
    adjustment: "在学校周边 150m 范围内布置遮阴和短时座椅",
  },
  {
    id: "agent_000040_act_02",
    label: "户外配送",
    origin: "菜鸟驿站",
    destination: "果真鲜生活超市",
    time: "14:55",
    distance: "6.9km",
    exposure: "63.9",
    failed: "连续道路边热暴露",
    adjustment: "沿高暴露路径设置饮水与短暂停留点",
  },
];

export function createInitialAgentState() {
  const createdAt = timestamp();

  return {
    project: {
      projectName: "高温设施规划 Agent Demo",
      studyArea: "北京市海淀区",
      scenarioDate: "2024-07-典型高温日",
      facilityType: ["遮阴设施", "饮水点", "休憩点", "清凉驿站"],
      priorityGroups: ["慢病老人", "接送学家庭", "儿童", "户外劳动者"],
      defaultStrategy: "equity",
      constraints: ["高温暴露", "道路可达", "设施开放", "存量复用", "人工核验"],
      dataInventory: {
        population: { label: "WorldPop 人口", status: "ready" },
        poi: { label: "POI 与既有设施", status: "ready" },
        walkingNetwork: { label: "OSM 步行路网", status: "ready" },
        lst: { label: "Landsat LST", status: "ready" },
        existingFacilities: { label: "党群、卫生、文化等设施", status: "ready" },
        routeSegments: { label: "活动路径分段", status: "mock" },
        treeCanopy: { label: "树冠覆盖", status: "mock" },
        openingHours: { label: "开放时间", status: "missing" },
        landuse: { label: "EULUC 土地利用", status: "ready" },
      },
      gisInterfaces: mockGisInterfaces,
    },
    intent: {
      rawUserInput: "优先保障老人和接送学家庭，应该在哪里布置清凉设施？",
      taskType: "candidate_site_generation",
      taskTypeLabel: "候选点生成",
      parsedGoal: "面向重点人群识别高温治理失效空间，并生成清凉设施候选方案。",
      targetGroups: ["慢病老人", "接送学家庭"],
      planningObject: "清凉设施响应单元",
      strategy: "equity",
      outputType: "siteSelectionPlan",
      constraints: ["低绕行", "近学校", "近医疗点", "可短暂停留", "人工复核"],
      classification: {
        taskType: "candidate_site_generation",
        taskTypeLabel: "候选点生成",
        confidence: 1,
        matchedKeywords: ["初始化示例"],
        source: "mock",
        candidateScores: [],
      },
    },
    workflow: {
      currentStep: "idle",
      completedSteps: [],
      pendingSteps: ["goal_parse", "precheck", "risk_overlay", "candidate_generation", "plan_review"],
      generatedPlan: null,
      reviewedPlan: null,
      taskGraph: null,
      reviewedTaskGraph: null,
      executedTaskGraph: null,
      toolCallHistory: [],
      replannerEvents: [],
      versionHistory: [
        {
          version: "v0.1",
          time: createdAt,
          summary: "初始化 mock AgentState，等待规划师输入治理目标。",
        },
      ],
    },
    diagnosis: {
      highRiskZones: ["学院路-中关村南部", "学校周边等待空间", "社区卫生服务站周边"],
      exposedPopulation: 128000,
      activityHotspots: ["就医取药", "学校接送", "短时等待", "户外配送"],
      priorityCells: ["H-021", "H-034", "H-057", "H-081"],
      activityCases: mockActivityCases,
      activityRoutes: mockActivityRoutes,
    },
    facilityAudit: {
      existingFacilities: [
        { id: "fac-party-01", name: "党群服务中心", type: "清凉驿站", readiness: "high" },
        { id: "fac-health-02", name: "社区卫生服务站", type: "休憩+饮水", readiness: "medium" },
        { id: "fac-culture-03", name: "公共文化空间", type: "临时避暑", readiness: "medium" },
      ],
      coverageRate: 0.64,
      facilityGaps: ["学校周边等待点缺遮阴", "高暴露道路饮水点稀疏", "慢病老人就医路径缺休憩点"],
      avgWalkDistance: 420,
      uncoveredPopulation: 46000,
      candidateSearchArea: ["学校周边150m", "卫生服务站周边300m", "党群服务中心步行可达区"],
    },
    candidateSites: mockCandidateSites,
    scenarios: {
      fairnessFirst: {
        label: "公平优先",
        coverageRate: 0.71,
        exposedPopulationReduced: 18300,
        tradeoff: "覆盖效率略低，但对老人和接送学家庭更友好。",
      },
      efficiencyFirst: {
        label: "效率优先",
        coverageRate: 0.79,
        exposedPopulationReduced: 21200,
        tradeoff: "整体覆盖更高，但重点人群精准性下降。",
      },
      lowCostFirst: {
        label: "低成本优先",
        coverageRate: 0.73,
        exposedPopulationReduced: 15400,
        tradeoff: "优先复用存量设施，需核验开放时段。",
      },
      emergencyFirst: {
        label: "应急优先",
        coverageRate: 0.68,
        exposedPopulationReduced: 17100,
        tradeoff: "短期响应快，但长期运营机制需要补充。",
      },
    },
    report: {
      selectedPlan: "fairnessFirst",
      evidenceSummary: "候选点由热风险、重点人群、活动路径、设施可达和存量复用条件共同筛选。",
      uncertainty: ["开放时间缺失", "室内容量未核验", "部分活动路径为 mock"],
      manualChecklist: ["现场核验候选点空间", "确认设施开放时间", "确认管理主体", "核验安全与无障碍条件"],
      exportStatus: "draft",
    },
    agent: {
      status: "idle",
      currentGoal: "优先保障老人和接送学家庭，应该在哪里布置清凉设施？",
      selectedTaskType: "candidate_site_generation",
      strategy: "equity",
      createdAt,
      updatedAt: createdAt,
    },
    runtime: {
      preconditions: [],
      constraintImpact: null,
      nextSteps: [],
    },
  };
}

export function createInitialProjectState() {
  return createInitialAgentState().project;
}

export function createAgentVersionEntry(summary, previousHistory = [], versionLabel) {
  const nextVersionNumber = previousHistory
    .filter((entry) => /^V\d+/.test(entry.version ?? ""))
    .length + 1;

  return {
    version: versionLabel ?? `V${nextVersionNumber}`,
    time: timestamp(),
    summary,
  };
}
