import type { SVGProps } from "react";

/**
 * Corporate icon for psys (Process System): process box with flow nodes.
 */
const PsysIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Process box (rounded rect) */}
    <rect
      x="2"
      y="2"
      width="28"
      height="28"
      rx="6"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    {/* Two nodes + connection (process/system) */}
    <circle cx="11" cy="16" r="3" fill="currentColor" />
    <circle cx="21" cy="16" r="3" fill="currentColor" />
    <path
      d="M14 16h4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export { PsysIcon };
