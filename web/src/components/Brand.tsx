import type { ReactNode, SVGProps } from "react";

/** The lens mark: a small rounded tile, as in the favicon. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center bg-primary text-on-primary"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} fill="none" stroke="currentColor">
        <circle cx="14" cy="14" r="7" strokeWidth="3.2" />
        <path d="M19 19l6 6" strokeWidth="3.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-semibold tracking-[-0.01em]">Lecture Lens</span>
    </span>
  );
}

function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const Icon = {
  upload: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </Svg>
  ),
  arrow: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Svg>
  ),
  eye: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  play: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M7 4l13 8-13 8z" />
    </Svg>
  ),
  compass: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </Svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5 5.5-6" />
    </Svg>
  ),
  folder: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 5h6l2 2h10v12H3z" />
    </Svg>
  ),
  home: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z" />
    </Svg>
  ),
  plus: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  menu: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  chevron: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  send: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  ),
  text: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  ),
  calendar: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
};
