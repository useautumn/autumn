import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import { groupRowsByScope } from "./groupRowsByScope";

export type SkeletonScope = { entityId: string | null; rowCount: number };

const EMPTY_PHASE: SkeletonScope[] = [{ entityId: null, rowCount: 1 }];

export const formPhasesToSkeletonPhases = ({
	phases,
}: {
	phases: CustomerStatePhase[];
}): SkeletonScope[][] =>
	phases.map((phase) => {
		const chosenPlans = phase.plans.filter((plan) => plan.productId);
		if (chosenPlans.length === 0) return EMPTY_PHASE;
		return groupRowsByScope({ rows: chosenPlans }).map(
			({ entityId, rows }) => ({ entityId, rowCount: rows.length }),
		);
	});
