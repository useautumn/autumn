import type { ReactNode } from "react";
import {
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { PlanRowPresence } from "./PlanRowPresence";
import { PlanScopeLabel } from "./PlanScopeLabel";

// A new scope table only appears when a row moves into it, so it lands after the row leaves.
const NEW_SCOPE_ENTER_DELAY = 0.18;

type ScopedPlan = { productId: string; entityId?: string | null };

const groupPlanIndexesByScope = ({ plans }: { plans: ScopedPlan[] }) => {
	const groups = new Map<string | null, number[]>();
	for (const [planIndex, plan] of plans.entries()) {
		if (!plan.productId) continue;
		const entityId = plan.entityId ?? null;
		const planIndexes = groups.get(entityId);
		if (planIndexes) {
			planIndexes.push(planIndex);
			continue;
		}
		groups.set(entityId, [planIndex]);
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
		<PlanRowPresence enterDelay={NEW_SCOPE_ENTER_DELAY}>
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
