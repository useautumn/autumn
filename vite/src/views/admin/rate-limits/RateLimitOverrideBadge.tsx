import { StatusChip } from "@autumn/ui";

/** "Acme 20k/s · 240k/min": an org and the values it overrides. */
export const RateLimitOverrideBadge = ({
	orgName,
	values,
}: {
	orgName: string;
	values: string[];
}) => (
	<StatusChip tone="purple" glyph="pencil">
		<span className="truncate">{orgName}</span>
		<span className="tabular-nums">{values.join(" · ")}</span>
	</StatusChip>
);
