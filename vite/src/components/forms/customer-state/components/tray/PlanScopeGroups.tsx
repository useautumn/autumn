import type { ReactNode } from "react";
import {
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { PlanRowPresence } from "./PlanRowPresence";

function PlanScopeLabel({ entityId }: { entityId: string | null }) {
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const label = entityId ? selectedEntity?.name || entityId : "Customer-level";

	return (
		<p className="truncate px-2 pt-1.5 pb-1 text-xs font-medium text-tertiary-foreground">
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
 * plan join the last surface, so choosing their scope doesn't move them.
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

	const rows = (planIndexes: number[]) => (
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			<PlanRowPresence itemClassName={TABLE_TRAY_SURFACE_ROW_CLASS}>
				{planIndexes.map(renderPlan)}
			</PlanRowPresence>
		</div>
	);

	if (!showHeaders) return rows([...plans.keys()]);

	const pickerPlanIndexes = [...plans.keys()].filter(
		(planIndex) => !plans[planIndex]?.productId,
	);
	const groups = groupPlanIndexesByScope({ plans });
	const lastGroupIndex = groups.length - 1;

	if (groups.length === 0) return rows(pickerPlanIndexes);

	return (
		<PlanRowPresence>
			{groups.map(([entityId, planIndexes], groupIndex) => (
				<div key={entityId ?? "customer"} className="pb-1">
					<PlanScopeLabel entityId={entityId} />
					{rows(
						groupIndex === lastGroupIndex
							? [...planIndexes, ...pickerPlanIndexes]
							: planIndexes,
					)}
				</div>
			))}
		</PlanRowPresence>
	);
}
