export type PartitionRoute = { partition: number; routeEpoch: string };
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
export type WorkerRouteSuccessor = PartitionRoute & { endpoint: string };
export type WorkerErrorResponse = {
	error: {
		code: WorkerErrorCode;
		message: string;
		reason?: string;
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

export const WORKER_REQUEST_BUDGET_HEADER = "x-request-budget-ms";

export function requestBudgetHeaderValue({
	expiresAt,
	now = performance.now(),
}: {
	expiresAt: number;
	now?: number;
}): string {
	return String(Math.max(0, Math.floor(expiresAt - now)));
}

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
