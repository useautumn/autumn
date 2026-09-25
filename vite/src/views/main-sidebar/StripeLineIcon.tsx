import { SIDEBAR_ICON_STROKE } from "./sidebarRowClass";

export const StripeLineIcon = () => (
	<svg
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={SIDEBAR_ICON_STROKE}
		viewBox="0 0 24 24"
	>
		<path d="M5.5 8 20.5 5 18.5 16 3.5 19Z" />
	</svg>
);
