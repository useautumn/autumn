import type { ApiVersion, AppEnv } from "@autumn/shared";
import type { BatchCreateEntitiesParams } from "../actions/batchCreateEntities.js";

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
	failedAt: number;
}
