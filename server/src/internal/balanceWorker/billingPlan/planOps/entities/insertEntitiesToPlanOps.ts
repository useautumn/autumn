import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

export const insertEntitiesToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.insertEntities ?? []).map((entity) =>
		toBillingPlanInsertOp({ table: "entity", row: entity }),
	);
