import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "./track.js";
import {
	type PartitionRoute,
	parsePartitionRoute,
	readWorkerEnvelope,
	type WorkerErrorResponse,
	WorkerProtocolError,
} from "./worker.js";

/** Most commands one `/v1/track-batch` request may carry; the worker refuses more. */
export const MAX_TRACK_BATCH_COMMANDS = 1000;

/** Many tracks for one partition in one request, so the per-request cost is paid once. */
export type BalanceWorkerTrackBatchRequest = {
	route: PartitionRoute;
	commands: TrackCommand[];
};

/** One command's answer: its reply, or the status and error `/v1/track` would have answered it with. */
export type TrackBatchItemResult =
	| { ok: true; reply: TrackReply }
	| { ok: false; status: number; error: WorkerErrorResponse["error"] };

/** One result per command, in the order the commands were sent. */
export type TrackBatchReply = { results: TrackBatchItemResult[] };

/** The envelope only; each command is validated on its own so one bad command fails alone. */
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
