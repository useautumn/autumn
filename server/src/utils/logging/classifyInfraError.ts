import type { ErrorClassifier } from "@autumn/errors";
import { RecaseError } from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";

/** Balance worker failures that mean "a dependency was unreachable or slow", not a broken request. */
const UNAVAILABLE_WORKER_CODES = new Set([
	"DEADLINE",
	"TRANSPORT",
	"OWNERSHIP_UNAVAILABLE",
	"COMMAND_LOG_UNAVAILABLE",
	"CATALOG_INVALIDATIONS_UNAVAILABLE",
]);

/** Matched by name, so the logger doesn't import the Kafka client to classify. */
const isUnavailableWorkerError = (error: Error) =>
	error.name === "BalanceWorkerClientError" &&
	"code" in error &&
	UNAVAILABLE_WORKER_CODES.has(String(error.code));

/** Transient dependency failures: one is noise, a rate of them is an incident. */
export const classifyInfraError: ErrorClassifier = ({ error }) => {
	if (!(error instanceof Error)) return;
	if (error instanceof RecaseError && error.statusCode < 500) return;

	const isInfra =
		(error instanceof RecaseError && error.code === "service_unavailable") ||
		error.name.startsWith("KafkaJS") ||
		isUnavailableWorkerError(error) ||
		isTransientDbError({ error }) ||
		isTransientRedisError({ error });
	if (!isInfra) return;

	return {
		kind: "infra",
		code: "code" in error ? String(error.code) : undefined,
	};
};
