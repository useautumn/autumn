import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

/** Entities the plan creates, before the rows provisioned on them. */
export const insertEntitiesToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.insertEntities ?? []).map((entity) =>
		toBillingPlanInsertOp({ table: "entity", row: entity }),
	);
