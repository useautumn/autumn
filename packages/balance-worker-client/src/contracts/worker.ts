export type PartitionRoute = { partition: number; routeEpoch: string };
/** `command` always carries the identity the route is checked against; `payload` is what rides beside it (initialize's rows). */
export type WorkerRequest = {
	route: PartitionRoute;
	command: unknown;
	payload?: unknown;
};
export type WorkerErrorCode =
	| "INVALID_REQUEST"
	| "NOT_OWNER"
	| "NOT_READY"
	| "NOT_INITIALIZED"
	| "CUSTOMER_NOT_FOUND"
	| "ENTITY_NOT_FOUND"
	| "CATALOG_NOT_FOUND"
	| "COMMAND_CONFLICT"
	| "DUPLICATE_COMMAND"
	| "UNSUPPORTED_COMMAND"
	| "INTERNAL";
export type WorkerErrorResponse = {
	error: { code: WorkerErrorCode; message: string; reason?: string };
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
		case "COMMAND_CONFLICT":
		case "DUPLICATE_COMMAND":
			return 409;
		case "CUSTOMER_NOT_FOUND":
		case "ENTITY_NOT_FOUND":
			return 404;
		case "CATALOG_NOT_FOUND":
			return 422;
		case "NOT_READY":
			return 503;
		case "INTERNAL":
			return 500;
	}
}
