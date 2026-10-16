import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
import { displayTitle, groupWeeks, isProcessing, useModules } from "../lib/modules";
import { Icon, Logo } from "./Brand";

const OPEN_KEY = "lecture-lens-sidebar-open";
const ROW = "flex h-7 items-center gap-2 rounded-md px-2 transition-colors";
const ACTIVE = "bg-press font-medium text-ink";
const IDLE = "text-muted hover:bg-hover hover:text-ink";

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

/** App layout: a sidebar tree of modules, weeks and lectures beside the page. */
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
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/25" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-sidebar shadow-window">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-line px-2 md:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" className="btn btn-ghost btn-sm px-1.5">
            <Icon.menu className="h-[18px] w-[18px]" />
          </button>
          <Link href="/library" className="text-sm">
            <Logo size={20} />
          </Link>
        </div>
        {/* Keyed by route so each page eases in on navigation; the sidebar stays put. */}
        <div key={location} className="anim-rise flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Expands to its content's height with a transition; closed content is inert (not focusable). */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`collapse ${open ? "is-open" : ""}`} inert={!open}>
      <div>{children}</div>
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
    <nav className="scroll-quiet flex h-full flex-col overflow-y-auto px-2 py-2 text-sm" aria-label="Modules">
      <Link href="/" className="mb-2 flex h-10 items-center rounded-md px-2 hover:bg-hover" aria-label="Lecture Lens front page">
        <Logo size={20} />
      </Link>
      <NavItem href="/library" active={location === "/library"} icon={<Icon.home className="h-4 w-4" />}>
        Library
      </NavItem>

      <p className="mt-5 mb-1 px-2 text-xs font-medium text-faint">Modules</p>
      {modules?.map((m) => <ModuleBranch key={m.id} module={m} open={open} toggle={toggle} location={location} />)}
      <Link href="/library?new=module" className={`${ROW} ${IDLE}`}>
        <span className="flex w-4 justify-center">
          <Icon.plus className="h-4 w-4" />
        </span>
        New module
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
      <Collapse open={expanded}>
        <div className="ml-3.5">
          {m.lectures.length === 0 && m.weeks.length === 0 && <p className="py-1 pl-7 text-xs text-faint">No lectures yet</p>}
          {groupWeeks(m).map(({ week, label, lectures }) => {
            const key = `${m.id}:${week}`;
            const weekOpen = open.has(key);
            return (
              <div key={key}>
                <Row expanded={weekOpen} onToggle={() => toggle(key)} icon={<Icon.calendar className="h-3.5 w-3.5" />}>
                  {label}
                </Row>
                <Collapse open={weekOpen}>
                  <div className="ml-3.5">
                    {lectures.length === 0 && <p className="py-1 pl-7 text-xs text-faint">Empty</p>}
                    {lectures.map((l) => (
                      <NavItem key={l.id} href={`/lectures/${l.id}`} active={location === `/lectures/${l.id}`} icon={<LectureDot lecture={l} />}>
                        {displayTitle(l)}
                      </NavItem>
                    ))}
                  </div>
                </Collapse>
              </div>
            );
          })}
        </div>
      </Collapse>
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
    <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
  return (
    <div className={`group flex h-7 items-center rounded-md transition-colors ${active ? ACTIVE : IDLE}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse" : "Expand"}
        className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-press hover:text-ink"
      >
        <Icon.chevron className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {href ? (
        <Link href={href} className="flex h-full min-w-0 flex-1 items-center">
          {label}
        </Link>
      ) : (
        <button type="button" onClick={onToggle} className="flex h-full min-w-0 flex-1 items-center text-left">
          {label}
        </button>
      )}
    </div>
  );
}

function NavItem({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${ROW} ${active ? ACTIVE : IDLE}`}>
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

const ICON_SIZES = {
  sm: "h-[18px] w-[18px] rounded text-[10px]",
  md: "h-9 w-9 rounded-lg text-sm",
  lg: "h-16 w-16 rounded-xl text-2xl",
};

/** A module's page icon: its initial on a soft tile. */
export function ModuleIcon({ name, size = "sm" }: { name: string; size?: keyof typeof ICON_SIZES }) {
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center bg-sand font-semibold text-ink ${ICON_SIZES[size]}`}>
      {letter}
    </span>
  );
}

/** Lecture icon: a play mark when ready, a pulsing dot while processing, red when failed. */
export function LectureDot({ lecture }: { lecture: Lecture }) {
  if (isProcessing(lecture)) return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" title="Processing" />;
  if (lecture.status === "failed") return <span className="h-1.5 w-1.5 rounded-full bg-bad" title="Failed" />;
  return <Icon.play className="h-3 w-3" />;
}
