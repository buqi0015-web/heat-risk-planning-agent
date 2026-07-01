import React from "react";
import { ShieldCheck } from "lucide-react";
import heroReference from "../assets/hero-reference.png";

function MetricCard({ item }) {
  const Icon = item.icon;
  return (
    <article className={`planner-metric planner-metric--${item.tone}`}>
      <div className="planner-metric__icon"><Icon aria-hidden="true" size={22} /></div>
      <div>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.meta}</small>
      </div>
    </article>
  );
}

export function MainContent({ children }) {
  return (
    <main id="main-content" className="planner-workspace">
      {children}
    </main>
  );
}

export function HeroBanner({ title, isRisk = false, showNote = false }) {
  return (
    <section className={`planner-hero ${isRisk ? "planner-hero--risk" : ""}`}>
      {isRisk ? (
        <div className="planner-hero-static" role="img" aria-label="高温设施规划 Agent 产品主视觉">
          <img src={heroReference} alt="" />
        </div>
      ) : (
        <div>
          <span className="eyebrow">负责任的规划智能体&nbsp;&nbsp;RESPONSIBLE PLANNER AGENT</span>
          <h1>{title}</h1>
          <p>从“哪里热”到“影响了谁、阻碍了什么活动、设施如何响应”</p>
          <div className="planner-hero__planning-grid" aria-hidden="true" />
          <div className="planner-hero__heat-dots" aria-hidden="true" />
          <div className="planner-hero__skyline" aria-hidden="true" />
          <div className="planner-hero__heat-tile" aria-hidden="true"><span>AI</span></div>
        </div>
      )}
      {showNote && (
        <div className="planner-hero__note">
          <ShieldCheck size={20} />
          <span>GIS核验空间事实，受约束LLM组织居民活动情境、解释问题并生成可审议证据。</span>
        </div>
      )}
    </section>
  );
}

export function MetricCards({ cards }) {
  return (
    <section className="planner-metric-grid" aria-label="关键指标">
      {cards.map((item) => <MetricCard key={item.label} item={item} />)}
    </section>
  );
}

export function RiskDashboardLayout({ hero, metrics, map, aiPanel, comparison }) {
  return (
    <>
      <section className="planner-risk-layout">
        <div className="planner-risk-left">
          {hero}
          {metrics}
          {map}
        </div>
        {aiPanel}
      </section>
      {comparison}
    </>
  );
}
