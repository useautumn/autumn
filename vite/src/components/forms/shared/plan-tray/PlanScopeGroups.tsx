import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { PlanScopeLabel } from "./PlanScopeLabel";

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

export function PlanScopeGroups({
	plans,
	showHeaders,
	renderPlan,
	addRow,
}: {
	plans: ScopedPlan[];
	showHeaders: boolean;
	renderPlan: (planIndex: number) => ReactNode;
	addRow: ReactNode;
}) {
	const chosenPlanIndexes = [...plans.keys()].filter(
		(planIndex) => plans[planIndex]?.productId,
	);
	const pickerPlanIndex = plans.findIndex((plan) => !plan.productId);

	const rows = (planIndexes: number[]) => (
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			{planIndexes.map(renderPlan)}
		</div>
	);

	return (
		<div className="flex flex-col">
			{chosenPlanIndexes.length > 0 &&
				(showHeaders
					? groupPlanIndexesByScope({ plans }).map(
							([entityId, planIndexes]) => (
								<div key={entityId ?? "customer"} className="pb-1">
									<PlanScopeLabel entityId={entityId} />
									{rows(planIndexes)}
								</div>
							),
						)
					: rows(chosenPlanIndexes))}
			{pickerPlanIndex === -1 ? addRow : renderPlan(pickerPlanIndex)}
		</div>
	);
}
