import type {
	ApplyBillingPlanRequest,
	Catalog,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerApplyBillingPlanRequest = {
	route: PartitionRoute;
	command: ApplyBillingPlanRequest["command"];
	payload: Pick<ApplyBillingPlanRequest, "catalogRows">;
};

/** `applied`: the plan landed in Postgres. `customer_exists` / `entity_exists`: it creates a row another request created first; nothing was written. */
export type ApplyBillingPlanReply = {
	result:
		| { status: "applied" | "customer_exists" }
		| { status: "entity_exists"; entity: { id: string; internal_id: string } };
	state: SubjectState;
	catalog: Catalog;
};
