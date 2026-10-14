export const SeriesSwatch = ({ color }: { color?: string }) => (
	<span
		aria-hidden="true"
		className="size-2 shrink-0 rounded-[2px] bg-subtle"
		style={color ? { background: color } : undefined}
	/>
);
