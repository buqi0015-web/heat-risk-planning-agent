import React from "react";
import {
  Bell,
  CircleUserRound,
  Menu,
  ThermometerSun,
  X,
} from "lucide-react";

function Sidebar({ active, setActive, open, setOpen, navItems }) {
  return (
    <aside className={`sidebar planner-sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand">
        <div className="brand__mark">
          <ThermometerSun aria-hidden="true" size={22} />
          <i aria-hidden="true" />
        </div>
        <div className="brand__copy"><strong>高温设施规划 Agent</strong><span>PLANNER COPILOT</span></div>
        <button className="icon-button mobile-only" aria-label="关闭导航" onClick={() => setOpen(false)}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <nav aria-label="主要导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={active === id ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => { setActive(id); setOpen(false); }}
          >
            <Icon aria-hidden="true" size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__foot">
        <div className="sidebar-status-card">
          <div className="sidebar-status-card__head"><span>项目状态</span><b>进行中</b></div>
          <div className="progress"><span /></div>
          <strong>Demo mock data</strong>
          <small>面向高温设施规划验证工作台</small>
        </div>
        <div className="sidebar-team-card">
          <CircleUserRound aria-hidden="true" size={34} />
          <div><strong>高温规划团队</strong><small>规划师</small></div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ active, setMenuOpen, navItems }) {
  const label = navItems.find((item) => item.id === active)?.label ?? "风险诊断";
  return (
    <header className="topbar planner-topbar">
      <button className="icon-button mobile-only" aria-label="打开导航" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" size={19} />
      </button>
      <div className="topbar__context">
        <span>海淀区 · 典型高温日</span>
        <strong>{label}</strong>
      </div>
      <div className="topbar__actions">
        <div className="topbar__status"><span aria-hidden="true" />Agent 在线 · 运行正常</div>
        <button className="topbar-icon-button" aria-label="通知"><Bell aria-hidden="true" size={17} /></button>
        <div className="topbar-avatar" aria-hidden="true">A</div>
      </div>
    </header>
  );
}

export function AppShell({
  active,
  setActive,
  menuOpen,
  setMenuOpen,
  navItems,
  children,
}) {
  return (
    <div className="app-shell planner-shell">
      <Sidebar
        active={active}
        setActive={setActive}
        open={menuOpen}
        setOpen={setMenuOpen}
        navItems={navItems}
      />
      <div className="app-main">
        <TopBar active={active} setMenuOpen={setMenuOpen} navItems={navItems} />
        {children}
      </div>
    </div>
  );
}
