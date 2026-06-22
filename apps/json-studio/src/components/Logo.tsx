/** The JSON Studio mark (matches brand/logo.svg). */
export function Logo({ size = 18 }: { size?: number }) {
  const gid = "jsLogoGrad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="0"
          x2="1024"
          y2="1024"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#4C8DFF" />
          <stop offset="1" stopColor="#C678DD" />
        </linearGradient>
      </defs>
      <rect x="70" y="70" width="884" height="884" rx="200" fill="#15181F" />
      <g
        stroke={`url(#${gid})`}
        strokeWidth="68"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M370 268 Q300 268 300 346 L300 434 Q300 512 226 512 Q300 512 300 590 L300 678 Q300 756 370 756" />
        <path d="M654 268 Q724 268 724 346 L724 434 Q724 512 798 512 Q724 512 724 590 L724 678 Q724 756 654 756" />
      </g>
      <g stroke={`url(#${gid})`} strokeWidth="26" strokeLinecap="round" fill="none">
        <path d="M512 452 L512 560" />
        <path d="M452 560 L572 560" />
        <path d="M452 560 L452 600" />
        <path d="M572 560 L572 600" />
      </g>
      <g fill={`url(#${gid})`}>
        <circle cx="512" cy="452" r="44" />
        <circle cx="452" cy="612" r="36" />
        <circle cx="572" cy="612" r="36" />
      </g>
    </svg>
  );
}
