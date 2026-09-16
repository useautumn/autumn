/** Operator output never carries raw database messages, connection strings or
 *  archived request bodies, so failures are described by name and code only.
 *  Errors this operator raises itself are safe by construction and keep their
 *  reason. */
const SAFE_REPLAY_OPERATOR_ERROR_NAMES: ReadonlySet<string> = new Set([
	"ReplayOperatorError",
	"ReplayOperatorArgumentError",
	"ReplayOperatorCleanupError",
	"ReplayManifestError",
	"ReplayStagingTargetError",
]);

export type ReplayOperatorErrorReport = {
	name: string;
	code?: string;
	reason?: string;
};

export type ReplayOperatorCloseFailure = Readonly<{
	port: string;
	errorName: string;
	code?: string;
}>;

export class ReplayOperatorError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "ReplayOperatorError";
	}
}

function describeCloseFailure(failure: ReplayOperatorCloseFailure): string {
	return `${failure.port} (${failure.errorName})`;
}

export class ReplayOperatorCleanupError extends Error {
	readonly failures: readonly ReplayOperatorCloseFailure[];

	constructor({
		failures,
	}: { failures: readonly ReplayOperatorCloseFailure[] }) {
		super(
			`replay operator cleanup failed while closing: ${failures
				.map(describeCloseFailure)
				.join(", ")}`,
		);
		this.name = "ReplayOperatorCleanupError";
		this.failures = failures;
	}
}

function readErrorCode({ error }: { error: Error }): string | undefined {
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" && code.length > 0 ? code : undefined;
}

export function describeReplayOperatorError({
	error,
}: {
	error: unknown;
}): ReplayOperatorErrorReport {
	if (!(error instanceof Error)) return { name: "UnknownError" };
	const report: ReplayOperatorErrorReport = { name: error.name };
	const code = readErrorCode({ error });
	if (code !== undefined) report.code = code;
	if (SAFE_REPLAY_OPERATOR_ERROR_NAMES.has(error.name))
		report.reason = error.message;
	return report;
}

export function buildReplayOperatorCloseFailure({
	port,
	error,
}: {
	port: string;
	error: unknown;
}): ReplayOperatorCloseFailure {
	const described = describeReplayOperatorError({ error });
	return described.code === undefined
		? { port, errorName: described.name }
		: { port, errorName: described.name, code: described.code };
}
