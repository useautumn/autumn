import { MigrationRunErrorCode } from "@autumn/shared";
import Stripe from "stripe";
import { BatchMigrationErrorName } from "../../batchOperations/execute/errors/batchMigrationErrors.js";

const MAX_CAUSE_DEPTH = 5;

const TIMEOUT_TRIGGER_CODES = [
	"MAX_DURATION_EXCEEDED",
	"TASK_RUN_HEARTBEAT_TIMEOUT",
	"TASK_RUN_STALLED_EXECUTING",
	"TASK_RUN_STALLED_EXECUTING_WITH_WAITPOINTS",
	"GRACEFUL_EXIT_TIMEOUT",
	"TASK_PROCESS_SIGKILL_TIMEOUT",
];

const INTERRUPTED_TRIGGER_CODES = [
	"TASK_RUN_CRASHED",
	"TASK_PROCESS_OOM_KILLED",
	"TASK_PROCESS_MAYBE_OOM_KILLED",
	"TASK_PROCESS_SIGSEGV",
	"TASK_PROCESS_SIGTERM",
	"TASK_PROCESS_EXITED_WITH_NON_ZERO_CODE",
	"POD_EVICTED",
	"POD_UNKNOWN_ERROR",
	"DISK_SPACE_EXCEEDED",
];

/** Keyed by name: errors crossing a trigger subtask arrive as plain Errors
 * keeping only `name` (trigger's internal failures use their code as `name`). */
const NAMED_ERROR_CODES: Record<string, MigrationRunErrorCode> = {
	[BatchMigrationErrorName.CacheInvalidation]:
		MigrationRunErrorCode.CacheInvalidationIncomplete,
	[BatchMigrationErrorName.Stall]: MigrationRunErrorCode.TimedOut,
	[BatchMigrationErrorName.PageLimit]: MigrationRunErrorCode.PageLimitExceeded,
	TASK_RUN_CANCELLED: MigrationRunErrorCode.Canceled,
	...Object.fromEntries(
		TIMEOUT_TRIGGER_CODES.map((code) => [code, MigrationRunErrorCode.TimedOut]),
	),
	...Object.fromEntries(
		INTERRUPTED_TRIGGER_CODES.map((code) => [
			code,
			MigrationRunErrorCode.Interrupted,
		]),
	),
};

const isStripeError = (error: Error): boolean =>
	error instanceof Stripe.errors.StripeError ||
	("type" in error &&
		typeof error.type === "string" &&
		error.type.startsWith("Stripe"));

const classifyOne = (error: Error): MigrationRunErrorCode | null => {
	if (isStripeError(error)) return MigrationRunErrorCode.StripeError;
	return NAMED_ERROR_CODES[error.name] ?? null;
};

/** Walks the error and its causes (a subtask's error is the unwrap's cause). */
export const classifyMigrationRunError = ({
	error,
}: {
	error: unknown;
}): MigrationRunErrorCode => {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		if (!(current instanceof Error)) break;
		const code = classifyOne(current);
		if (code) return code;
		current = current.cause;
	}
	return MigrationRunErrorCode.Unknown;
};
