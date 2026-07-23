import type {
	ApiVersion,
	AppEnv,
	CheckParams,
	TrackParams,
} from "@autumn/shared";

export type CustomerCreationRecoveryStage =
	| "lookup"
	| "pre_commit"
	| "existing"
	| "autumn_committed"
	| "completed";

export type CustomerCreationRecoveryParams = Omit<
	TrackParams | CheckParams,
	"customer_id"
> & {
	customer_id: string | null;
};

export interface CustomerCreationRecoveryPayload {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	requestId: string;
	apiVersion: ApiVersion;
	params: CustomerCreationRecoveryParams;
	source?: string;
	withAutumnId?: boolean;
	failureStage: CustomerCreationRecoveryStage;
	failedAt: number;
}
