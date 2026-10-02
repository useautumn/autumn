import type { ErrorClassifier } from "@autumn/errors";
import { RecaseError } from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";

/** Balance worker failures that mean "a dependency was unreachable or slow", not a broken request. */
const UNAVAILABLE_WORKER_CODES = new Set([
	"DEADLINE",
	"TRANSPORT",
	"NO_OWNER",
	"ROUTE_STILL_STALE",
	"OWNERSHIP_UNAVAILABLE",
	"COMMAND_LOG_UNAVAILABLE",
	"CATALOG_INVALIDATIONS_UNAVAILABLE",
]);

/** Server errors that say the worker never took the command; one that may have applied stays a bug. */
const UNAVAILABLE_RECASE_CODES = new Set([
	"service_unavailable",
	"balance_worker_unavailable",
]);

/** Matched by name, so the logger doesn't import the Kafka client to classify. NOT_READY is a partition still activating. */
const isUnavailableWorkerError = (error: Error) =>
	error.name === "BalanceWorkerClientError" &&
	"code" in error &&
	(UNAVAILABLE_WORKER_CODES.has(String(error.code)) ||
		("workerCode" in error && error.workerCode === "NOT_READY"));

/** The server's own transient failures (pg, redis, shed 503s, the balance worker); generic dependencies are classified in @autumn/errors. */
export const classifyInfraError: ErrorClassifier = ({ error }) => {
	if (!(error instanceof Error)) return;
	if (error instanceof RecaseError && error.statusCode < 500) return;

	const isInfra =
		(error instanceof RecaseError &&
			UNAVAILABLE_RECASE_CODES.has(error.code)) ||
		isUnavailableWorkerError(error) ||
		isTransientDbError({ error }) ||
		isTransientRedisError({ error });
	if (!isInfra) return;

	return {
		kind: "infra",
		code: "code" in error ? String(error.code) : undefined,
	};
};
