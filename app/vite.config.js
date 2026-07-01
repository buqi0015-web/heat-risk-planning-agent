import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapEntityIndex, queryAreaPlanningFacts } from "./src/agent/areaPlanningFacts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../..");

function loadRootEnv() {
  const envPath = path.join(workspaceRoot, ".env");
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return env;
    const [key, ...rest] = trimmed.split("=");
    env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    return env;
  }, {});
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function extractJson(content) {
  const cleaned = String(content ?? "").replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

let showcaseCache = null;
let placeIndexCache = null;

function readShowcaseData() {
  if (showcaseCache) return showcaseCache;
  const showcasePath = path.join(__dirname, "public", "data", "showcase.json");
  if (!fs.existsSync(showcasePath)) return null;
  showcaseCache = JSON.parse(fs.readFileSync(showcasePath, "utf8"));
  return showcaseCache;
}

function readPlaceIndex() {
  if (placeIndexCache) return placeIndexCache;
  const indexPath = path.join(__dirname, "public", "data", "place-index.json");
  if (!fs.existsSync(indexPath)) return null;
  placeIndexCache = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return placeIndexCache;
}

function roadRiskLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "无热风险数据";
  if (number >= 0.75) return "极高";
  if (number >= 0.6) return "高";
  if (number >= 0.45) return "中高";
  if (number >= 0.3) return "中";
  return "低";
}

function extractChineseTerms(input) {
  return Array.from(new Set(String(input ?? "")
    .match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) ?? []))
    .filter((term) => !["哪些", "还有", "附近", "怎么", "治理", "候选点", "清凉设施", "热风险", "等级"].includes(term))
    .slice(0, 8);
}

function summarizeRoadRisk(input) {
  const data = readShowcaseData();
  const roads = data?.roads?.features ?? [];
  const terms = extractChineseTerms(input);
  if (!roads.length || !terms.length) return [];

  const matches = roads
    .map((feature) => feature.properties ?? {})
    .filter((road) => {
      const name = road.road_name || "";
      if (!name || name === "（非成熟路线）") return false;
      return terms.some((term) => name.includes(term) || term.includes(name));
    })
    .map((road) => {
      const heatStress = road.effective_heat_stress ?? road.heat_stress ?? null;
      return {
        roadName: road.road_name,
        roadType: road.fclass_cn ?? null,
        heatStress,
        riskLevel: roadRiskLevel(heatStress),
        hasHeatData: Boolean(road.has_heat_data),
        treeCanopyCover: road.tree_canopy_cover ?? null,
      };
    })
    .sort((a, b) => Number(b.heatStress ?? -1) - Number(a.heatStress ?? -1));

  const deduped = [];
  const seen = new Set();
  for (const road of matches) {
    if (seen.has(road.roadName)) continue;
    seen.add(road.roadName);
    deduped.push(road);
    if (deduped.length >= 12) break;
  }
  return deduped;
}

function deepseekIntentProxy() {
  return {
    name: "deepseek-intent-proxy",
    configureServer(server) {
      server.middlewares.use("/api/agent/intent", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const env = { ...loadRootEnv(), ...process.env };
          const apiKey = env.DEEPSEEK_API_KEY;
          if (!apiKey) {
            res.statusCode = 501;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "DEEPSEEK_API_KEY is not configured" }));
            return;
          }

          const body = await readJsonBody(req);
          const areaPlanningFacts = queryAreaPlanningFacts({
            input: body.input,
            showcaseData: readShowcaseData(),
            placeIndex: readPlaceIndex(),
            candidateSites: body.agentStateSummary?.candidateSites ?? [],
            existingFacilities: body.agentStateSummary?.existingFacilities ?? [],
          });
          const mapEntityIndex = buildMapEntityIndex({
            showcaseData: readShowcaseData(),
            placeIndex: readPlaceIndex(),
            candidateSites: body.agentStateSummary?.candidateSites ?? [],
            existingFacilities: body.agentStateSummary?.existingFacilities ?? [],
          });
          const enrichedAgentStateSummary = {
            ...(body.agentStateSummary ?? {}),
            roadRiskContext: summarizeRoadRisk(body.input),
            areaPlanningFacts,
            mapEntityIndex,
          };
          const baseUrl = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
          const model = env.DEEPSEEK_MODEL || "deepseek-chat";
          const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `你是高温设施规划 Agent 的意图理解与规划模块。你只能输出 JSON。
判断用户输入是否属于高温设施规划；无关问题不能触发规划工作流。
但无关问题也要像正常智能体一样自然回答，不要只做生硬的边界判断；如果缺少实时数据接口，要坦诚说明。
相关问题需要提取目标人群、规划对象、策略、约束、任务类型和缺失前置条件。
不能编造候选点、人口、覆盖率或方案结果；这些必须来自 AgentState 或工具结果。
JSON 字段必须包含：isPlanningRelated, responseType, taskType, taskTypeLabel, shouldRunWorkflow, intent, missingPreconditions, userReply, nextActions。`,
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    userInput: body.input,
                    fallbackStrategy: body.fallbackStrategy,
                    clientRoute: body.clientRoute,
                    agentStateSummary: enrichedAgentStateSummary,
                    dataUseRules: [
                      "必须尊重 clientRoute：如果 clientRoute.isPlanningRelated 为 false，不能把问题改判成规划任务。",
                      "如果 clientRoute.routeId 为 general_chat，要自然回答用户问题，isPlanningRelated=false，shouldRunWorkflow=false。",
                      "如果 clientRoute.routeId 为 spatial_rag 或 map_fact，必须基于地图事实或 AgentState 回答，不要凭空判断。",
                      "只要问题涉及地点、道路、候选点、设施缺口或热风险，必须优先使用 agentStateSummary.areaPlanningFacts。",
                      "普通闲聊、问候、天气、日期、能力介绍等问题可以直接回答，但 isPlanningRelated 必须为 false，shouldRunWorkflow 必须为 false。",
                      "普通问题不要输出“该问题不属于规划任务”这类生硬话术，除非用户明确要求启动规划流程。",
                      "如果用户问实时天气而没有实时天气工具，只能说明未接入实时天气接口，并可引导其提供城市或转入高温风险规划分析。",
                      "如果用户问哪里最缺、哪里最大、哪里最严重、全区排行这类问题，必须使用 areaPlanningFacts.districtRankings 回答，不要要求用户补充具体地名。",
                      "如果 areaPlanningFacts.mapHit 为 false，只能说明当前地图索引未命中，不能编造该地点的风险或缺口。",
                      "如果 areaPlanningFacts.hasFacilityGap 为 true，即使候选点为空，也必须承认该片区存在缺口或高热暴露需求。",
                      "如果 areaPlanningFacts.hasCandidateSites 为 false，应该说明当前候选点清单未覆盖该范围，并建议重跑候选点生成。",
                      "回答候选点问题时，必须优先使用 agentStateSummary.candidateSites。",
                      "回答道路热风险问题时，必须优先使用 agentStateSummary.roadRiskContext。",
                      "如果数据中没有命中用户提到的道路或地点，要明确说明当前数据未命中，不能编造。",
                      "可以基于已有候选点给出替代参考，但必须说明来自当前候选点清单。",
                      "权属、施工条件、安全影响、开放时间必须标记为人工核验事项。",
                    ],
                    allowedTaskTypes: [
                      "risk_diagnosis",
                      "facility_gap_analysis",
                      "candidate_site_generation",
                      "scenario_comparison",
                      "constraint_revision",
                      "report_generation",
                      "goal_understanding",
                    ],
                  }),
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            res.statusCode = response.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "DeepSeek request failed", detail: errorText.slice(0, 500) }));
            return;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          const parsed = extractJson(content);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ...parsed, areaPlanningFacts, mapEntityIndex: mapEntityIndex.counts, llmProvider: "deepseek", llmModel: model }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error.message || "Intent proxy failed" }));
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), deepseekIntentProxy()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          map: ["maplibre-gl"],
          charts: ["recharts"],
        },
      },
    },
  },
});
