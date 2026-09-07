import {
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import { z } from "zod/v4";

const workerRequestSchema = z
	.object({
		route: z
			.object({
				partition: z.number().int().nonnegative().safe(),
				routeEpoch: z.string().regex(/^(0|[1-9]\d*)$/),
			})
			.strict(),
		command: z.unknown(),
	})
	.strict();

export type PartitionRoute = { partition: number; routeEpoch: string };

export type WorkerRequest = {
	route: PartitionRoute;
	command: unknown;
};

export type TrackRequest = {
	route: PartitionRoute;
	command: TrackCommand;
};
export type TrackResponse = { decision: TrackDecision };
export type WorkerErrorCode =
	| "INVALID_REQUEST"
	| "NOT_OWNER"
	| "NOT_READY"
	| "INTERNAL";
export type WorkerErrorResponse = {
	error: { code: WorkerErrorCode; message: string };
};

export function parseWorkerRequest({
	input,
}: {
	input: unknown;
}): WorkerRequest {
	return workerRequestSchema.parse(input);
}

export function parseTrackRequest({ input }: { input: unknown }): TrackRequest {
	const request = parseWorkerRequest({ input });
	return {
		route: request.route,
		command: parseTrackCommand({ input: request.command }),
	};
}
