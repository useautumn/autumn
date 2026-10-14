import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "./track.js";
import {
	type PartitionRoute,
	parsePartitionRoute,
	readWorkerEnvelope,
	type WorkerErrorResponse,
	WorkerProtocolError,
} from "./worker.js";

export const MAX_TRACK_BATCH_COMMANDS = 1000;

export type BalanceWorkerTrackBatchRequest = {
	route: PartitionRoute;
	commands: TrackCommand[];
};

export type TrackBatchItemResult =
	| { ok: true; reply: TrackReply }
	| { ok: false; status: number; error: WorkerErrorResponse["error"] };

export type TrackBatchReply = { results: TrackBatchItemResult[] };

export function parseTrackBatchRequest({ input }: { input: unknown }): {
	route: PartitionRoute;
	commands: unknown[];
} {
	const request = readWorkerEnvelope({ input, keys: ["route", "commands"] });
	const { commands } = request;
	if (
		!Array.isArray(commands) ||
		commands.length === 0 ||
		commands.length > MAX_TRACK_BATCH_COMMANDS
	)
		throw new WorkerProtocolError(
			`Commands must be a nonempty array of at most ${MAX_TRACK_BATCH_COMMANDS}`,
		);
	return { route: parsePartitionRoute({ input: request.route }), commands };
}
