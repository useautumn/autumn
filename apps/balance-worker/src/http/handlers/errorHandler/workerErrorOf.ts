import {
	LockAlreadyExistsError,
	LockNotFoundError,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import {
	type WorkerErrorResponse,
	WorkerProtocolError,
} from "@autumn/balance-worker-client/protocol";
import { CatalogRowsNotFoundError } from "@autumn/catalog-lru";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod/v4";
import { FlushRecordRefusedError } from "../../../committer/committerErrors.js";
import { PartitionProcessorStateNotFoundError } from "../../../processor/common/processorErrors.js";
import {
	SubjectCatalogEvictedError,
	SubjectLoadOvertakenError,
	SubjectNotFoundError,
	SubjectStaleError,
} from "../../../processor/subject/subjectErrors.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
	PartitionWriterRecordTooLargeError,
	PartitionWriterStateNotFoundError,
} from "../../../processor/writer/writerErrors.js";
import { OwnedPartitionNotReadyError } from "../../../runtime/runtimeErrors.js";
import { ConflictingMutationReceiptError } from "../../../state/stateStoreErrors.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "../../middlewares/runtimeRouting/runtimeRoutingErrors.js";

export type WorkerErrorStatus = 400 | 404 | 409 | 422 | 429 | 503 | 500;

/** How any failure is answered: the status and error body a caller branches on. Pure, so a
 *  single request and each command of a batch are answered the same way. */
export function workerErrorOf({ cause }: { cause: unknown }): {
	status: WorkerErrorStatus;
	error: WorkerErrorResponse["error"];
} {
	let status: WorkerErrorStatus = 500;
	let error: WorkerErrorResponse["error"] = {
		code: "INTERNAL",
		message: "Worker request failed",
	};
	if (
		cause instanceof ZodError ||
		cause instanceof WorkerProtocolError ||
		cause instanceof PartitionRouteMismatchError ||
		(cause instanceof HTTPException && cause.status === 400)
	) {
		status = 400;
		error = { code: "INVALID_REQUEST", message: "Invalid worker request" };
	} else if (cause instanceof UnsupportedCommandError) {
		status = 400;
		error = {
			code: "UNSUPPORTED_COMMAND",
			message: `The worker cannot decide this command: ${cause.reason}`,
			reason: cause.reason,
		};
	} else if (
		cause instanceof ConflictingMutationReceiptError ||
		cause instanceof PartitionWriterCommandConflictError
	) {
		status = 409;
		error = {
			code: "COMMAND_CONFLICT",
			message: "Command id reused with a different request",
		};
	} else if (cause instanceof LockAlreadyExistsError) {
		status = 409;
		error = {
			code: "LOCK_ALREADY_EXISTS",
			message: "The customer already holds an open lock under this id",
		};
	} else if (cause instanceof LockNotFoundError) {
		status = 404;
		error = {
			code: "LOCK_NOT_FOUND",
			message:
				"No open lock under this id: never taken, already settled, or expired",
		};
	} else if (cause instanceof PartitionWriterDuplicateCommandError) {
		status = 409;
		error = {
			code: "DUPLICATE_COMMAND",
			message: "Command id already applied",
		};
	} else if (
		cause instanceof PartitionWriterStateNotFoundError ||
		cause instanceof PartitionProcessorStateNotFoundError
	) {
		status = 409;
		error = {
			code: "NOT_INITIALIZED",
			message: "Customer must be initialized before check or track",
		};
	} else if (cause instanceof SubjectNotFoundError) {
		status = 404;
		error = cause.identity.entityId
			? {
					code: "ENTITY_NOT_FOUND",
					message: "Entity does not exist for this customer",
				}
			: {
					code: "CUSTOMER_NOT_FOUND",
					message: "Customer does not exist in this org and env",
				};
	} else if (cause instanceof FlushRecordRefusedError) {
		// Skipped for good, so nothing landed; unlike INTERNAL the caller knows a retry will fail the same way.
		status = 500;
		error = {
			code: "RECORD_REFUSED",
			message:
				"Postgres refused this command's rows; nothing was applied and a retry would be refused the same way",
		};
	} else if (cause instanceof SubjectStaleError) {
		status = 409;
		error = {
			code: "STALE_SUBJECT",
			message:
				"Customer changed while the command was decided; nothing was applied, retry",
		};
	} else if (cause instanceof CatalogRowsNotFoundError) {
		status = 422;
		error = {
			code: "CATALOG_NOT_FOUND",
			message: "Customer state references catalog rows that do not exist",
		};
	} else if (cause instanceof SubjectCatalogEvictedError) {
		status = 503;
		error = {
			code: "NOT_READY",
			message: "Catalog rows were evicted before the decision; retry",
		};
	} else if (cause instanceof SubjectLoadOvertakenError) {
		status = 503;
		error = {
			code: "NOT_READY",
			message: "Customer kept changing while it was loaded; retry",
		};
	} else if (cause instanceof PartitionRouteNotOwnedError) {
		status = 409;
		error = {
			code: "NOT_OWNER",
			message: "Route is not admitted by this worker",
		};
	} else if (cause instanceof OwnedPartitionNotReadyError) {
		status = 503;
		error = {
			code: "NOT_READY",
			message: "Partition cannot accept this request",
		};
	} else if (cause instanceof PartitionWriterRecordTooLargeError) {
		status = 422;
		error = {
			code: "RECORD_TOO_LARGE",
			message:
				"This customer's state is too large to write in one record; nothing was applied",
		};
	} else if (cause instanceof PartitionWriterCapacityError) {
		status = 429;
		error = {
			code: "OVERLOADED",
			message: "Partition is at capacity for this customer; retry with backoff",
		};
	}
	return { status, error };
}
