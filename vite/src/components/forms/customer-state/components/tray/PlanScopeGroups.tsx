import { Fragment, type ReactNode } from "react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";

function PlanScopeLabel({ entityId }: { entityId: string | null }) {
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const label = entityId ? selectedEntity?.name || entityId : "Customer-level";

	return (
		<p className="truncate px-2 pt-1.5 text-xs font-medium text-tertiary-foreground">
			{label}
		</p>
	);
}

type ScopedPlan = { productId: string; entityId?: string | null };

const groupPlanIndexesByScope = ({ plans }: { plans: ScopedPlan[] }) => {
	const groups = new Map<string | null, number[]>();
	for (const [planIndex, plan] of plans.entries()) {
		if (!plan.productId) continue;
		const entityId = plan.entityId ?? null;
		groups.set(entityId, [...(groups.get(entityId) ?? []), planIndex]);
	}
	return [...groups.entries()];
};

/**
 * One surface of plan rows per customer or entity scope. Rows still picking a
 * plan get their own surface below, so choosing their scope doesn't move them.
 */
export function PlanScopeGroups({
	plans,
	showHeaders,
	renderPlan,
}: {
	plans: ScopedPlan[];
	showHeaders: boolean;
	renderPlan: (planIndex: number) => ReactNode;
}) {
	if (plans.length === 0) return null;

	if (!showHeaders) {
		return (
			<div className={TABLE_TRAY_SURFACE_CLASS}>
				{plans.map((_, planIndex) => renderPlan(planIndex))}
			</div>
		);
	}

	const pickerPlanIndexes = [...plans.keys()].filter(
		(planIndex) => !plans[planIndex]?.productId,
	);

	return (
		<>
			{groupPlanIndexesByScope({ plans }).map(([entityId, planIndexes]) => (
				<Fragment key={entityId ?? "customer"}>
					<PlanScopeLabel entityId={entityId} />
					<div className={TABLE_TRAY_SURFACE_CLASS}>
						{planIndexes.map(renderPlan)}
					</div>
				</Fragment>
			))}
			{pickerPlanIndexes.length > 0 && (
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					{pickerPlanIndexes.map(renderPlan)}
				</div>
			)}
		</>
	);
}
