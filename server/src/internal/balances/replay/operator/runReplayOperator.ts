import { buildReplayManifestCohorts } from "../manifest/buildReplayManifestCohorts.js";
import { parseReplayManifest } from "../manifest/parseReplayManifest.js";
import type { ReplayManifest } from "../manifest/replayManifestContracts.js";
import type { ValidatedReplayStagingTarget } from "../targets/replayStagingTargetContracts.js";
import { validateReplayStagingTarget } from "../targets/validateReplayStagingTarget.js";
import { ReplayOperatorError } from "./replayOperatorErrors.js";

/** Provisional ceilings for the first staging operator. A larger archive
 *  replay needs its own approval, not a higher flag value. */
export const REPLAY_OPERATOR_MAX_SELECTED_REQUESTS = 1000;
export const REPLAY_OPERATOR_MAX_REQUESTS_PER_SECOND = 10;
export const REPLAY_OPERATOR_CUSTOMER_LANES = 4;

export type ReplayOperatorOptions = Readonly<{
	execute: boolean;
	confirmFrozenBaseline: boolean;
	maxRequests: number;
	requestsPerSecond: number;
}>;

export type ReplayOperatorRunInput = Readonly<{
	manifest: ReplayManifest;
	requestsPerSecond: number;
	signal?: AbortSignal;
}>;

export type ReplayOperatorResources<TReport> = {
	run(input: ReplayOperatorRunInput): Promise<TReport>;
	close(): Promise<void>;
};

export type ReplayOperatorResourceFactory<TReport> = (input: {
	manifest: ReplayManifest;
	target: ValidatedReplayStagingTarget;
	signal?: AbortSignal;
}) => Promise<ReplayOperatorResources<TReport>>;

export type ReplayOperatorPreview = Readonly<{
	mode: "preview";
	target: ValidatedReplayStagingTarget;
	limits: Readonly<{ maxRequests: number; requestsPerSecond: number }>;
	manifest: Readonly<{ customerCount: number; requestCount: number }>;
}>;

export type ReplayOperatorExecution<TReport> = Readonly<{
	mode: "executed";
	report: TReport;
}>;

export type ReplayOperatorResult<TReport> =
	| ReplayOperatorPreview
	| ReplayOperatorExecution<TReport>;

function assertBoundedLimit({
	name,
	value,
	maximum,
}: {
	name: string;
	value: number;
	maximum: number;
}): void {
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw new ReplayOperatorError({
			message: `${name} must be a whole number between 1 and ${maximum}`,
		});
	}
}

function assertProvisionalLimits({
	options,
}: {
	options: ReplayOperatorOptions;
}): void {
	assertBoundedLimit({
		name: "max requests",
		value: options.maxRequests,
		maximum: REPLAY_OPERATOR_MAX_SELECTED_REQUESTS,
	});
	assertBoundedLimit({
		name: "requests per second",
		value: options.requestsPerSecond,
		maximum: REPLAY_OPERATOR_MAX_REQUESTS_PER_SECOND,
	});
}

function assertExecutionConfirmed({
	options,
}: {
	options: ReplayOperatorOptions;
}): void {
	if (options.execute && !options.confirmFrozenBaseline) {
		throw new ReplayOperatorError({
			message:
				"an execution must confirm the frozen baseline before any resource is opened",
		});
	}
}

function assertNotCancelled({ signal }: { signal?: AbortSignal }): void {
	if (signal?.aborted) {
		throw new ReplayOperatorError({
			message: "the replay run was cancelled before any resource was opened",
		});
	}
}

/** Truncating a manifest would silently change which archived observations the
 *  run covers, so an oversized selection is refused instead. */
function assertSelectionWithinCap({
	manifest,
	options,
}: {
	manifest: ReplayManifest;
	options: ReplayOperatorOptions;
}): void {
	if (manifest.requests.length > options.maxRequests) {
		throw new ReplayOperatorError({
			message: `the manifest selects ${manifest.requests.length} requests, above the max requests limit of ${options.maxRequests}; narrow the archive window instead of truncating it`,
		});
	}
}

function buildPreview({
	manifest,
	target,
	options,
}: {
	manifest: ReplayManifest;
	target: ValidatedReplayStagingTarget;
	options: ReplayOperatorOptions;
}): ReplayOperatorPreview {
	return {
		mode: "preview",
		target,
		limits: {
			maxRequests: options.maxRequests,
			requestsPerSecond: options.requestsPerSecond,
		},
		manifest: {
			customerCount: buildReplayManifestCohorts({ manifest }).length,
			requestCount: manifest.requests.length,
		},
	};
}

/** A factory that fails to start owns its own cleanup, so the close port only
 *  covers resources the operator actually received. */
async function executeReplay<TReport>({
	manifest,
	target,
	options,
	openResources,
	signal,
}: {
	manifest: ReplayManifest;
	target: ValidatedReplayStagingTarget;
	options: ReplayOperatorOptions;
	openResources: ReplayOperatorResourceFactory<TReport>;
	signal?: AbortSignal;
}): Promise<ReplayOperatorExecution<TReport>> {
	const resources = await openResources({ manifest, target, signal });
	try {
		const report = await resources.run({
			manifest,
			requestsPerSecond: options.requestsPerSecond,
			signal,
		});
		return { mode: "executed", report };
	} finally {
		await resources.close();
	}
}

/**
 * Validates the manifest, the provisional limits and the pinned staging target
 * before anything physical exists. Matching the supplied trusted policy is not
 * proof that the policy addresses staging infrastructure: the operator must
 * still verify the policy against the staging inventory before executing.
 */
export async function runReplayOperator<TReport>({
	manifestInput,
	targetInput,
	policyInput,
	options,
	openResources,
	signal,
}: {
	manifestInput: unknown;
	targetInput: unknown;
	policyInput: unknown;
	options: ReplayOperatorOptions;
	openResources: ReplayOperatorResourceFactory<TReport>;
	signal?: AbortSignal;
}): Promise<ReplayOperatorResult<TReport>> {
	assertProvisionalLimits({ options });
	assertExecutionConfirmed({ options });
	assertNotCancelled({ signal });
	const manifest = parseReplayManifest({ input: manifestInput });
	assertSelectionWithinCap({ manifest, options });
	const target = validateReplayStagingTarget({
		target: targetInput,
		policy: policyInput,
	});
	if (!options.execute) return buildPreview({ manifest, target, options });
	return executeReplay({ manifest, target, options, openResources, signal });
}
