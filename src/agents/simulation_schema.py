from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentInput:
    agent_type: str
    agent_label: str
    origin: str
    origin_lon: float
    origin_lat: float
    vulnerability_weight: float
    evidence_source_ids: list[str] = field(default_factory=list)


@dataclass
class EnvironmentInput:
    heat_stress: float
    heat_period: str
    destination_candidates: list[str] = field(default_factory=list)
    cooling_candidates: list[str] = field(default_factory=list)


@dataclass
class ActivityRecord:
    simulation_id: int
    activity: str
    trip_type: str
    trip_purpose: str
    activity_necessity: float
    activity_frequency: float
    origin: str
    origin_lon: float
    origin_lat: float
    destination: str
    destination_lon: float
    destination_lat: float
    departure_time: str
    time_rigidity: float
    route_flexibility: float
    detour_tolerance_minutes: float
    stop_probability: float
    maximum_stop_minutes: float
    outdoor_travel_minutes: float
    outdoor_dwell_minutes: float
    heat_period_overlap_minutes: float
    cumulative_heat_exposure: float
    max_continuous_outdoor_minutes: float
    activity_status: str
    action_probabilities: dict[str, float] = field(default_factory=dict)
    change_type: str = "none"
    heat_problem: list[str] = field(default_factory=list)
    new_behavior: str = ""
    facility_demand: list[str] = field(default_factory=list)
    matched_poi_types: list[str] = field(default_factory=list)
    suitable_interventions: list[str] = field(default_factory=list)
    candidate_facility: str = ""
    candidate_distance_m: float = 0.0
    cooling_accessibility: float = 0.0
    cooling_match: float = 0.0
    before_exposure: float = 0.0
    after_exposure: float = 0.0
    exposure_reduction_rate: float = 0.0
    activity_recovered: bool = False
    evidence_source_ids: list[str] = field(default_factory=list)
    evidence_source_titles: list[str] = field(default_factory=list)
    failure_zone_type: str = "none"
    reason: str = ""


@dataclass
class SimulationResult:
    agent_type: str
    risk_unit: str
    weather: str
    activities: list[ActivityRecord] = field(default_factory=list)
