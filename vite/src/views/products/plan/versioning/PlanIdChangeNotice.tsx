import type { PlanAliasReplacement } from "@autumn/shared";

const PlanId = ({ id }: { id: string }) => (
	<span className="font-mono font-medium text-foreground">{id}</span>
);

const ownerLabel = ({
	namesByPlanId,
	planId,
}: {
	namesByPlanId: Record<string, string>;
	planId: string;
}) => namesByPlanId[planId] ?? planId;

export const PlanIdChangeNotice = ({
	from,
	to,
	namesByPlanId,
	replacements,
}: {
	from?: string;
	to?: string;
	namesByPlanId: Record<string, string>;
	replacements: PlanAliasReplacement[];
}) => {
	const claimed =
		to === undefined
			? undefined
			: replacements.find((replacement) => replacement.alias_id === to);

	if (from === undefined || to === undefined) {
		if (replacements.length === 0) return null;
		return (
			<div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
				{replacements.map((replacement, index) => {
					const owner = ownerLabel({
						namesByPlanId,
						planId: replacement.plan_id,
					});
					return (
						<span key={`${replacement.alias_id}:${replacement.plan_id}`}>
							{index > 0 ? " " : null}
							<PlanId id={replacement.alias_id} /> is currently an alias of{" "}
							<span className="font-medium text-foreground">{owner}</span> and
							will stop working after saving.
						</span>
					);
				})}
			</div>
		);
	}

	return (
		<div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
			You're changing this plan's ID from <PlanId id={from} /> to{" "}
			<PlanId id={to} />. Existing calls using <PlanId id={from} /> will
			continue to work as an alias of <PlanId id={to} />.
			{claimed ? (
				<>
					{" "}
					<PlanId id={to} /> is currently an alias of{" "}
					<span className="font-medium text-foreground">
						{ownerLabel({ namesByPlanId, planId: claimed.plan_id })}
					</span>{" "}
					and will stop working after saving.
				</>
			) : null}
		</div>
	);
};
