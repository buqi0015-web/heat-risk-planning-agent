import realAgentData from "../data/realAgentData.json" with { type: "json" };

const withSource = (payload) => ({
  ...payload,
  __dataSource: "local-real",
  __sourceSummary: realAgentData.meta,
});

const ratio = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const scenarioComparison = () => Object.entries(realAgentData.scenarios).map(([scenarioKey, scenario]) => ({
  scenarioKey,
  label: scenario.label,
  coverageRate: scenario.coverageRate,
  exposedPopulationReduced: scenario.exposedPopulationReduced,
  costIndex: scenario.costIndex,
  feasibility: scenario.feasibility,
  failedActivityRecoveryRate: scenario.failedActivityRecoveryRate,
  highRiskResolvedRate: scenario.highRiskResolvedRate,
}));

export const realDataMeta = realAgentData.meta;

export const realToolResults = {
  getHeatRiskZones: ({ inputs }) => withSource({
    studyArea: inputs.studyArea,
    scenarioDate: inputs.scenarioDate,
    highRiskZones: realAgentData.diagnosis.highRiskZones,
    riskLevel: realAgentData.diagnosis.riskLevel,
    priorityCells: realAgentData.diagnosis.priorityCells,
  }),

  getPopulationExposure: ({ inputs }) => withSource({
    highRiskZoneCount: inputs.highRiskZones?.length ?? realAgentData.diagnosis.highRiskZones.length,
    targetGroups: inputs.targetGroups,
    exposedPopulation: realAgentData.diagnosis.exposedPopulation,
    groupExposureIndex: realAgentData.diagnosis.groupExposureIndex,
  }),

  getActivityHotspots: () => withSource({
    activityHotspots: realAgentData.diagnosis.activityHotspots,
  }),

  getExistingFacilities: () => withSource({
    existingFacilities: realAgentData.facilityAudit.existingFacilities,
  }),

  getFacilityCoverage: ({ inputs }) => withSource({
    facilityCount: inputs.existingFacilities?.length ?? realAgentData.facilityAudit.existingFacilities.length,
    coverageRate: realAgentData.facilityAudit.coverageRate,
    coveredCells: realAgentData.facilityAudit.coveredCells,
    uncoveredCells: realAgentData.facilityAudit.uncoveredCells,
  }),

  calculateWalkDistance: () => withSource({
    avgWalkDistance: realAgentData.facilityAudit.avgWalkDistance,
    routePressure: realAgentData.facilityAudit.routePressure,
  }),

  findFacilityGaps: () => withSource({
    facilityGaps: realAgentData.facilityAudit.facilityGaps,
    candidateSearchArea: realAgentData.facilityAudit.candidateSearchArea,
    uncoveredPopulation: realAgentData.facilityAudit.uncoveredPopulation,
  }),

  generateCandidateSites: () => withSource({
    candidateSites: realAgentData.candidateSites,
  }),

  checkSpatialConstraints: ({ inputs }) => {
    const sites = inputs.candidateSites?.length ? inputs.candidateSites : realAgentData.candidateSites;
    return withSource({
      feasibility: Object.fromEntries(sites.map((site) => [site.siteId, site.feasibility ?? "medium"])),
      manualCheck: realAgentData.report.manualChecklist,
    });
  },

  rankCandidateSites: ({ inputs }) => {
    const sites = inputs.candidateSites?.length ? inputs.candidateSites : realAgentData.candidateSites;
    const strategyMultiplier = {
      equity: 1.08,
      coverage: 1.04,
      reuse: 0.98,
      cost: 0.94,
    }[inputs.strategy] ?? 1;

    const rankedSites = [...sites]
      .map((site) => ({
        ...site,
        score: Math.round(ratio(site.score, 60) * strategyMultiplier * 10) / 10,
        evidence: [...(site.evidence ?? []), `已按${inputs.strategyLabel ?? "当前策略"}基于真实候选点得分重排`],
      }))
      .sort((a, b) => ratio(b.score) - ratio(a.score))
      .map((site, index) => ({ ...site, priority: index + 1 }));

    return withSource({ rankedSites });
  },

  generateCounterfactualPlan: () => withSource({
    scenarios: realAgentData.scenarios,
  }),

  comparePlans: ({ inputs }) => {
    const scenarios = inputs.scenarios ?? realAgentData.scenarios;
    const table = Object.keys(scenarios).length
      ? Object.entries(scenarios).map(([scenarioKey, scenario]) => ({
        scenarioKey,
        label: scenario.label,
        coverageRate: scenario.coverageRate,
        exposedPopulationReduced: scenario.exposedPopulationReduced,
        costIndex: scenario.costIndex,
        feasibility: scenario.feasibility,
      }))
      : scenarioComparison();

    return withSource({
      comparisonTable: table,
      recommendedPlan: "fairnessFirst",
      reason: realAgentData.report.evidenceSummary,
    });
  },

  exportPlanningReport: () => withSource({
    report: {
      title: "海淀区高温设施规划 Agent 审议草案",
      sections: ["项目背景", "风险诊断", "设施缺口", "候选点生成", "方案比选", "人工核验清单"],
      exportStatus: realAgentData.report.exportStatus,
    },
    manualChecklist: realAgentData.report.manualChecklist,
    uncertainty: realAgentData.report.uncertainty,
  }),
};
