import type { SVGProps } from "react";

/** Three log lines, the last shorter; matches the Paper sidebar design. Mirrors lucide's props. */
export const LogsIcon = ({
	size = 24,
	strokeWidth = 2,
	...props
}: SVGProps<SVGSVGElement> & { size?: number | string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		aria-hidden="true"
		{...props}
	>
		<path d="M4 6h16" />
		<path d="M4 12h16" />
		<path d="M4 18h10" />
	</svg>
);
