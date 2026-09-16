export type ReplayEnvironment = "live" | "sandbox";

export type ReplayOperation = "track" | "check";

export type ReplayRequestBody = Record<string, unknown>;

export type ReplayManifestBaseline = Readonly<{
	id: string;
	capturedAtMs: number;
}>;

export type ReplayManifestWindow = Readonly<{
	startMs: number;
	endMs: number;
}>;

export type ReplayArchiveProvenance = Readonly<{
	archivedAtMs: number;
	archiveWindowStartMs: number;
	archiveWindowEndMs: number;
}>;

export type ReplayManifestRequest = Readonly<{
	id: string;
	orgId: string;
	env: ReplayEnvironment;
	customerId: string;
	operation: ReplayOperation;
	logicalTimestampMs: number;
	provenance: ReplayArchiveProvenance;
	body: ReplayRequestBody;
}>;

export type ReplayManifest = Readonly<{
	baseline: ReplayManifestBaseline;
	window: ReplayManifestWindow;
	logicalRunEndMs: number;
	requests: readonly ReplayManifestRequest[];
}>;

export type ReplayManifestCohortIdentity = Readonly<{
	orgId: string;
	env: ReplayEnvironment;
	customerId: string;
}>;

export type ReplayManifestCohort = Readonly<{
	identity: ReplayManifestCohortIdentity;
	featureIds: readonly string[];
	requestCount: number;
	requests: readonly ReplayManifestRequest[];
}>;

export type ReplayValidationIssue = Readonly<{
	path: readonly PropertyKey[];
	message: string;
}>;

export const REPLAY_BODY_CUSTOMER_ID_FIELD = "customer_id";

export const REPLAY_BODY_FEATURE_ID_FIELD = "feature_id";

export const REPLAY_BODY_TIMESTAMP_FIELD = "timestamp";

export class ReplayManifestError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "ReplayManifestError";
	}
}
