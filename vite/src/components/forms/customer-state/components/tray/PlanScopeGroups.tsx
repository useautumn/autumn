import { BuildingsIcon, UserIcon } from "@phosphor-icons/react";
import { Fragment, type ReactNode } from "react";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";

function PlanScopeGroupHeader({ entityId }: { entityId: string | null }) {
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const Icon = entityId ? BuildingsIcon : UserIcon;
	const label = entityId ? selectedEntity?.name || entityId : "Customer-level";

	return (
		<div className="flex h-8 items-center gap-1.5 border-b border-table-row-divider bg-table-tray/50 px-3 text-xs font-medium text-muted-foreground">
			<Icon className="shrink-0 text-tertiary-foreground" size={12} />
			<span className="truncate">{label}</span>
		</div>
	);
}

const groupPlanIndexesByScope = ({
	plans,
}: {
	plans: { entityId?: string | null }[];
}) => {
	const groups = new Map<string | null, number[]>();
	for (const [planIndex, plan] of plans.entries()) {
		const entityId = plan.entityId ?? null;
		groups.set(entityId, [...(groups.get(entityId) ?? []), planIndex]);
	}
	return [...groups.entries()];
};

/** Plan rows grouped under a header per customer or entity scope. */
export function PlanScopeGroups({
	plans,
	showHeaders,
	renderPlan,
}: {
	plans: { entityId?: string | null }[];
	showHeaders: boolean;
	renderPlan: (planIndex: number) => ReactNode;
}) {
	if (!showHeaders) return plans.map((_, planIndex) => renderPlan(planIndex));

	return groupPlanIndexesByScope({ plans }).map(([entityId, planIndexes]) => (
		<Fragment key={entityId ?? "customer"}>
			<PlanScopeGroupHeader entityId={entityId} />
			{planIndexes.map(renderPlan)}
		</Fragment>
	));
}
