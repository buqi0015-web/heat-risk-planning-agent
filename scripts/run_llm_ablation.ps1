param(
  [int]$Agents = 12,
  [int]$Seed = 2026,
  [string]$ScenarioDate = "2024-06-18"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$EnvDir = "outputs\haidian\agent_env_residential_proxy"
$RoadEdges = "outputs\haidian\road\osm_walk_network\haidian_osm_walkable_edges_main.csv"
$RoadEnvironment = "outputs\haidian\road\osm_walk_network\haidian_osm_road_environment.csv"
$Common = @(
  "--env-dir", $EnvDir,
  "--n", $Agents,
  "--min-activities-per-agent", 1,
  "--max-activities-per-agent", 1,
  "--weather-mode", "era5_hourly",
  "--scenario-date", $ScenarioDate,
  "--route-mode", "road",
  "--road-edges", $RoadEdges,
  "--road-environment", $RoadEnvironment,
  "--route-cost-mode", "environment",
  "--seed", $Seed
)

python scripts\run_agent_standalone.py @Common --decision-mode structured --output-dir outputs\haidian\agent_runs\llm_ablation_structured
if ($LASTEXITCODE -ne 0) { throw "Structured ablation failed." }

python scripts\run_agent_standalone.py @Common --decision-mode deepseek --deepseek-ablation full --output-dir outputs\haidian\agent_runs\llm_ablation_full
if ($LASTEXITCODE -ne 0) { throw "Full constrained-LLM ablation failed." }

python scripts\run_agent_standalone.py @Common --decision-mode deepseek --deepseek-ablation no_spatial_context --output-dir outputs\haidian\agent_runs\llm_ablation_no_spatial
if ($LASTEXITCODE -ne 0) { throw "No-spatial-context LLM ablation failed." }

python scripts\run_agent_standalone.py @Common --decision-mode deepseek --deepseek-ablation no_structured_prior --output-dir outputs\haidian\agent_runs\llm_ablation_no_prior
if ($LASTEXITCODE -ne 0) { throw "No-structured-prior LLM ablation failed." }

python scripts\compare_llm_decision_ablations.py `
  --structured-run outputs\haidian\agent_runs\llm_ablation_structured `
  --llm-full-run outputs\haidian\agent_runs\llm_ablation_full `
  --llm-no-spatial-run outputs\haidian\agent_runs\llm_ablation_no_spatial `
  --llm-no-prior-run outputs\haidian\agent_runs\llm_ablation_no_prior
if ($LASTEXITCODE -ne 0) { throw "LLM ablation comparison failed." }

Write-Host "Constrained-LLM ablation completed." -ForegroundColor Green
