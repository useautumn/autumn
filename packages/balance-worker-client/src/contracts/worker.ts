export type PartitionRoute = { partition: number; routeEpoch: string };
/** `command` always carries the identity the route is checked against; `payload` is what rides beside it (initialize's rows). */
export type WorkerRequest = {
	route: PartitionRoute;
	command: unknown;
	payload?: unknown;
};
export const WORKER_ERROR_CODES = [
	"INVALID_REQUEST",
	"NOT_OWNER",
	"NOT_READY",
	"OVERLOADED",
	"RECORD_TOO_LARGE",
	"NOT_INITIALIZED",
	"STALE_SUBJECT",
	"CUSTOMER_NOT_FOUND",
	"ENTITY_NOT_FOUND",
	"CATALOG_NOT_FOUND",
	"COMMAND_CONFLICT",
	"DUPLICATE_COMMAND",
	"LOCK_ALREADY_EXISTS",
	"LOCK_NOT_FOUND",
	"UNSUPPORTED_COMMAND",
	"RECORD_REFUSED",
	"INTERNAL",
] as const;
export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];
export const PARTITION_RECOVERY_REASON = "PARTITION_RECOVERY";
/** Where a partition went: the route its old owner claimed for the successor, so a caller can try it without a refresh. */
export type WorkerRouteSuccessor = PartitionRoute & { endpoint: string };
export type WorkerErrorResponse = {
	error: {
		code: WorkerErrorCode;
		message: string;
		reason?: string;
		/** On NOT_OWNER, once the handoff has named the successor. */
		successor?: WorkerRouteSuccessor;
	};
};

export class WorkerProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkerProtocolError";
	}
}

export function readWorkerEnvelope({
	input,
	keys,
}: {
	input: unknown;
	keys: readonly string[];
}): Record<string, unknown> {
	if (typeof input !== "object" || input === null || Array.isArray(input))
		throw new WorkerProtocolError("Worker envelope must be an object");
	if (Object.keys(input).length !== keys.length)
		throw new WorkerProtocolError("Worker envelope has unexpected fields");
	for (const key of keys) {
		if (!Object.hasOwn(input, key))
			throw new WorkerProtocolError(`Worker envelope is missing ${key}`);
	}
	return input as Record<string, unknown>;
}

export function parsePartitionRoute({
	input,
}: {
	input: unknown;
}): PartitionRoute {
	const { partition, routeEpoch } = readWorkerEnvelope({
		input,
		keys: ["partition", "routeEpoch"],
	});
	if (
		typeof partition !== "number" ||
		!Number.isSafeInteger(partition) ||
		partition < 0
	)
		throw new WorkerProtocolError(
			"Partition must be a nonnegative safe integer",
		);
	if (typeof routeEpoch !== "string" || !/^(0|[1-9]\d*)$/.test(routeEpoch))
		throw new WorkerProtocolError("Route epoch must be a canonical decimal");
	return { partition, routeEpoch };
}

export function parseWorkerRequest({
	input,
}: {
	input: unknown;
}): WorkerRequest {
	const hasPayload =
		typeof input === "object" &&
		input !== null &&
		Object.hasOwn(input, "payload");
	const request = readWorkerEnvelope({
		input,
		keys: hasPayload ? ["route", "command", "payload"] : ["route", "command"],
	});
	return {
		route: parsePartitionRoute({ input: request.route }),
		command: request.command,
		...(hasPayload ? { payload: request.payload } : {}),
	};
}

export function workerErrorStatus({ code }: { code: WorkerErrorCode }): number {
	switch (code) {
		case "INVALID_REQUEST":
		case "UNSUPPORTED_COMMAND":
			return 400;
		case "NOT_OWNER":
		case "NOT_INITIALIZED":
		case "STALE_SUBJECT":
		case "COMMAND_CONFLICT":
		case "DUPLICATE_COMMAND":
		case "LOCK_ALREADY_EXISTS":
			return 409;
		case "CUSTOMER_NOT_FOUND":
		case "ENTITY_NOT_FOUND":
		case "LOCK_NOT_FOUND":
			return 404;
		case "CATALOG_NOT_FOUND":
		case "RECORD_TOO_LARGE":
			return 422;
		case "NOT_READY":
			return 503;
		case "OVERLOADED":
			return 429;
		case "RECORD_REFUSED":
		case "INTERNAL":
			return 500;
	}
}

/** How many milliseconds the caller will still wait for this request. A worker still
 *  activating the partition holds the request for that long instead of a fixed wait,
 *  so a handoff to an idle successor costs the caller latency, not a fail-open. */
export const WORKER_REQUEST_BUDGET_HEADER = "x-request-budget-ms";
/** The server task asking for track grants; absent, the owner grants nothing. */
export const WORKER_TRACK_GRANT_LANE_HEADER = "x-track-grant-lane";

/** The header's value for a request that expires at `expiresAt` (a performance.now() time). */
export function requestBudgetHeaderValue({
	expiresAt,
	now = performance.now(),
}: {
	expiresAt: number;
	now?: number;
}): string {
	return String(Math.max(0, Math.floor(expiresAt - now)));
}

/** Undefined for a missing or malformed header: the worker then waits its fixed default. */
export function readRequestBudgetHeader({
	value,
}: {
	value: string | null | undefined;
}): number | undefined {
	if (value === null || value === undefined) return undefined;
	const trimmed = value.trim();
	if (!/^\d{1,9}$/.test(trimmed)) return undefined;
	return Number(trimmed);
}
