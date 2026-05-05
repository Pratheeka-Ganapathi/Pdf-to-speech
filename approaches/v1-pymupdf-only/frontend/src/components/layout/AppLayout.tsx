import { Outlet, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Upload, Headphones, Menu, X } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

const nav = [
  { path: "/", icon: FileText, label: "Library" },
  { path: "/upload", icon: Upload, label: "Upload" },
];

export function AppLayout() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="shell">
      <header className="mobile-bar">
        <button className="btn btn--icon" onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
        <div className="mobile-bar__brand"><Headphones size={17} /> <span>PDF to Speech</span></div>
      </header>

      <aside className={clsx("sidebar", open && "sidebar--open")}>
        <div className="sidebar__brand">
          <div className="sidebar__logo"><Headphones size={20} /></div>
          <div><h1 className="sidebar__title">PDF to Speech</h1><span className="sidebar__tag">AI-Powered</span></div>
        </div>

        <nav className="sidebar__nav">
          {nav.map(({ path, icon: I, label }) => (
            <Link key={path} to={path} className={clsx("nav-item", loc.pathname === path && "nav-item--on")} onClick={() => setOpen(false)}>
              <I size={17} /> <span>{label}</span>
              {loc.pathname === path && <motion.div className="nav-item__bg" layoutId="nav" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
            </Link>
          ))}
        </nav>
      </aside>

      {open && <div className="sidebar-mask" onClick={() => setOpen(false)} />}
      <main className="main"><Outlet /></main>
    </div>
  );
}
