import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
import { groupByWeek, isProcessing, useModules, weekLabel } from "../lib/modules";

const OPEN_KEY = "lecture-lens-sidebar-open";

function useExpanded() {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string, force?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // not remembered; fine
      }
      return next;
    });
  return { open, toggle };
}

/** Notion-style layout: a sidebar tree of modules, weeks and lectures beside the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [location] = useLocation();
  useEffect(() => setDrawer(false), [location]);

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-sidebar md:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-sidebar shadow-xl">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" className="rounded-ui px-2 py-1 text-lg leading-none text-muted hover:bg-hover">
            ☰
          </button>
          <Link href="/" className="text-sm font-semibold">
            Lecture Lens
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function Sidebar() {
  const { data: modules } = useModules();
  const [location] = useLocation();
  const { open, toggle } = useExpanded();

  // Keep the branch leading to the current lecture or module expanded.
  useEffect(() => {
    if (!modules) return;
    for (const m of modules) {
      const lecture = m.lectures.find((l) => location === `/lectures/${l.id}`);
      if (lecture) {
        if (!open.has(m.id)) toggle(m.id, true);
        const wk = `${m.id}:${lecture.week}`;
        if (!open.has(wk)) toggle(wk, true);
      } else if (location === `/modules/${m.id}` && !open.has(m.id)) toggle(m.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, modules]);

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3 text-sm" aria-label="Modules">
      <Link href="/" className="mb-3 flex items-center gap-2 rounded-ui px-2 py-1.5 font-semibold hover:bg-hover">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-ink text-[11px] font-bold text-bg">L</span>
        Lecture Lens
      </Link>
      <NavItem href="/" active={location === "/"} icon="⌂">
        Home
      </NavItem>

      <p className="mt-5 mb-1 px-2 text-xs font-medium text-faint">Modules</p>
      {modules?.map((m) => <ModuleBranch key={m.id} module={m} open={open} toggle={toggle} location={location} />)}
      <Link href="/?new=module" className="mt-1 flex items-center gap-2 rounded-ui px-2 py-1 text-muted hover:bg-hover">
        <span className="w-4 text-center">+</span> New module
      </Link>
    </nav>
  );
}

function ModuleBranch({
  module: m,
  open,
  toggle,
  location,
}: {
  module: ModuleWithLectures;
  open: Set<string>;
  toggle: (id: string) => void;
  location: string;
}) {
  const expanded = open.has(m.id);
  return (
    <div>
      <Row active={location === `/modules/${m.id}`} expanded={expanded} onToggle={() => toggle(m.id)} href={`/modules/${m.id}`} icon={<ModuleIcon name={m.name} />}>
        {m.name}
      </Row>
      {expanded && (
        <div className="ml-3">
          {m.lectures.length === 0 && <p className="py-1 pl-6 text-xs text-faint">No lectures yet</p>}
          {groupByWeek(m.lectures).map(({ week, lectures }) => {
            const key = `${m.id}:${week}`;
            const weekOpen = open.has(key);
            return (
              <div key={key}>
                <Row expanded={weekOpen} onToggle={() => toggle(key)} icon={<span className="text-faint">▤</span>}>
                  <span className="text-muted">{weekLabel(week)}</span>
                </Row>
                {weekOpen && (
                  <div className="ml-3">
                    {lectures.map((l) => (
                      <NavItem key={l.id} href={`/lectures/${l.id}`} active={location === `/lectures/${l.id}`} icon={<LectureDot lecture={l} />}>
                        {l.title}
                      </NavItem>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({
  children,
  icon,
  expanded,
  onToggle,
  href,
  active = false,
}: {
  children: ReactNode;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  href?: string;
  active?: boolean;
}) {
  const label = (
    <span className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2">
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
  return (
    <div className={`group flex items-center rounded-ui ${active ? "bg-hover font-medium" : "hover:bg-hover"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse" : "Expand"}
        className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[10px] text-faint hover:bg-hover"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1">
          {label}
        </Link>
      ) : (
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 text-left">
          {label}
        </button>
      )}
    </div>
  );
}

function NavItem({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-ui px-2 py-1 ${active ? "bg-hover font-medium" : "text-ink hover:bg-hover"}`}
    >
      <span className="flex w-4 shrink-0 justify-center text-faint">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function ModuleIcon({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded bg-accent-soft font-semibold text-accent ${
        size === "lg" ? "h-14 w-14 text-2xl" : "h-4 w-4 text-[10px]"
      }`}
    >
      {letter}
    </span>
  );
}

/** Lecture icon: a play mark when ready, a pulsing dot while processing, red when failed. */
export function LectureDot({ lecture }: { lecture: Lecture }) {
  if (isProcessing(lecture)) return <span className="h-2 w-2 animate-pulse rounded-full bg-warn" title="Processing" />;
  if (lecture.status === "failed") return <span className="h-2 w-2 rounded-full bg-bad" title="Failed" />;
  return <span className="text-[10px]">▷</span>;
}
