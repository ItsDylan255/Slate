/** Slate-Logo: drei gestapelte, schräge Schieferplatten (gleiches Motiv wie das App-Icon). */
export function SlateLogo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="slate-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill="url(#slate-logo-bg)" />
      <rect x="2" y="2" width="1020" height="1020" rx="230" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="4" />
      <g transform="translate(512 512) skewX(-14) translate(-512 -512)">
        <rect x="318" y="262" width="470" height="128" rx="40" fill="#fff" />
        <rect x="246" y="448" width="470" height="128" rx="40" fill="#fff" fillOpacity="0.66" />
        <rect x="318" y="634" width="470" height="128" rx="40" fill="#fff" fillOpacity="0.34" />
      </g>
    </svg>
  );
}
