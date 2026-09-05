export type PartitionRoute = { partition: number; routeEpoch: string };
export type WorkerRequest = { route: PartitionRoute; command: unknown };
export type WorkerErrorCode =
	| "INVALID_REQUEST"
	| "NOT_OWNER"
	| "NOT_READY"
	| "INTERNAL";
export type WorkerErrorResponse = {
	error: { code: WorkerErrorCode; message: string };
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
	const request = readWorkerEnvelope({ input, keys: ["route", "command"] });
	return {
		route: parsePartitionRoute({ input: request.route }),
		command: request.command,
	};
}

export function workerErrorStatus({ code }: { code: WorkerErrorCode }): number {
	switch (code) {
		case "INVALID_REQUEST":
			return 400;
		case "NOT_OWNER":
			return 409;
		case "NOT_READY":
			return 503;
		case "INTERNAL":
			return 500;
	}
}
