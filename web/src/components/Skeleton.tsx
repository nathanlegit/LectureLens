import { useState, type ImgHTMLAttributes } from "react";

/** An image that fades in once decoded instead of popping in. */
export function FadeImg({ className = "", onLoad, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      decoding="async"
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={`fade-img ${loaded ? "is-loaded" : ""} ${className}`}
    />
  );
}

/** Placeholders shaped like each page, shown while its data loads. */
export function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mt-12">
      <span className="skeleton h-3.5 w-28" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card overflow-hidden">
            <span className="skeleton aspect-video rounded-none" />
            <div className="space-y-2 p-3">
              <span className="skeleton h-4 w-4/5" />
              <span className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModuleSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto w-full max-w-4xl px-4 pt-12 pb-20 sm:px-6 md:px-12 md:pt-20">
      <span className="skeleton h-16 w-16 rounded-xl" />
      <span className="skeleton mt-5 h-10 w-2/3" />
      <span className="skeleton mt-3 h-4 w-1/2" />
      {[0, 1].map((w) => (
        <div key={w} className="mt-10">
          <span className="skeleton h-5 w-28" />
          <div className="mt-3 space-y-2.5">
            {[0, 1].map((i) => (
              <span key={i} className="skeleton h-4" style={{ width: `${70 - i * 15}%` }} />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}

export function LectureSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid flex-1 gap-6 px-4 pt-14 pb-4 md:px-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
      <div>
        <span className="skeleton h-8 w-3/4" />
        <span className="skeleton mt-3 h-4 w-32" />
        <span className="skeleton mt-5 aspect-video rounded-xl" />
      </div>
      <div className="card hidden space-y-3 p-4 xl:block">
        <span className="skeleton h-5 w-2/3" />
        {[90, 75, 85, 60, 80].map((w, i) => (
          <span key={i} className="skeleton h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
