import type { ApiVersion, AppEnv } from "@autumn/shared";
import type { BatchCreateEntitiesParams } from "../actions/batchCreateEntities.js";

/** Seats are invoiced before any row is written: past `stripe_invoiced`, a replay would charge again. */
export type EntityCreationRecoveryStage = "pre_commit" | "stripe_invoiced";

export type EntityCreationRecoveryParams = Omit<
	BatchCreateEntitiesParams,
	"ctx" | "enqueueRecoveryOnTransientFailure"
>;

export interface EntityCreationRecoveryPayload {
	orgId: string;
	env: AppEnv;
	customerId: string;
	requestId: string;
	apiVersion: ApiVersion;
	params: EntityCreationRecoveryParams;
	failureStage: EntityCreationRecoveryStage;
	failedAt: number;
}
