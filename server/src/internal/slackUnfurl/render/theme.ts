/**
 * Brand tokens mirrored from @autumn/ui (packages/ui/src/styles/index.css).
 * Kept as plain constants so takumi's Tailwind engine can interpolate them via
 * arbitrary values (e.g. tw={`bg-[${theme.bg}]`}) without pulling the runtime
 * Tailwind config. When we bundle Inter, set fontFamily here too.
 */
export const theme = {
	bg: "#fafaf9",
	surface: "#ffffff",
	foreground: "#121212",
	muted: "#6b6b6b",
	subtle: "#9a9a9a",
	border: "#e7e5e4",
	track: "#ececea",
	accent: "#1a1a1a",
	// Autumn brand purple — used for usage bars and balance progress fills.
	purple: "#7c5cff",
	purpleSoft: "#efeaff",
	positive: "#15803d",
	warning: "#b45309",
	danger: "#b91c1c",
} as const;

export const statusColor: Record<string, string> = {
	active: theme.positive,
	trialing: theme.accent,
	canceled: theme.muted,
	past_due: theme.danger,
};
