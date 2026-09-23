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

/** `applied`: the plan landed in Postgres. `customer_exists`: it creates a customer another request created first; nothing was written. */
export type ApplyBillingPlanReply = {
	result: { status: "applied" | "customer_exists" };
	state: SubjectState;
	catalog: Catalog;
};
