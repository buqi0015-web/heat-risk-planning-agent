import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReferenceStateCockpit } from "./components/ReferenceStateCockpit.jsx";
import { runPlanningAgent } from "./agent/planningEngine.js";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const defaultGoal = "优先保障老人和接送学家庭，在高温风险区补充清凉设施。";

function App() {
  const [goal, setGoal] = useState(defaultGoal);
  const [strategy, setStrategy] = useState("equity");
  const [agentState, setAgentState] = useState(() => runPlanningAgent({
    goal: defaultGoal,
    strategy: "equity",
    taskTypeHint: "candidate_site_generation",
  }));

  const handleRunGoal = (goalOverride = goal) => {
    const nextGoal = typeof goalOverride === "string" ? goalOverride : goal;
    setAgentState((previousState) => runPlanningAgent({
      previousState,
      goal: nextGoal,
      strategy,
      taskTypeHint: "candidate_site_generation",
    }));
  };

  return (
    <ReferenceStateCockpit
      agentState={agentState}
      goal={goal}
      setGoal={setGoal}
      strategy={strategy}
      setStrategy={setStrategy}
      onRunGoal={handleRunGoal}
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
