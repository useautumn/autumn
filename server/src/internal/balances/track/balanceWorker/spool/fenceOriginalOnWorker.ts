import { type TrackCommand, trackOfNothing } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { SpooledTrackFateUnknownError } from "./spooledTrackErrors.js";

/** "landed": the worker decided the original. "fenced": it had not, and now never will. */
export type OriginalTrackFate = "landed" | "fenced";

type TrackClient = Pick<BalanceWorkerClient, "track">;

const fenceCommand = async ({
	client,
	command,
}: {
	client: TrackClient;
	command: TrackCommand;
}): Promise<OriginalTrackFate> => {
	try {
		await client.track({ command: trackOfNothing({ command }) });
		return "fenced";
	} catch (error) {
		if (error instanceof BalanceWorkerClientError) {
			// A fence this replay already placed on an earlier delivery.
			if (error.workerCode === "DUPLICATE_COMMAND") return "fenced";
			if (error.workerCode === "COMMAND_CONFLICT") return "landed";
		}
		throw new SpooledTrackFateUnknownError({ cause: error });
	}
};

/**
 * Sends a zero-value track under each original command id. The partition decides one command at a time, so either
 * the original was decided first and the fence conflicts, or the fence takes the id and a late original is consumed
 * as a conflict without deducting. The fence commits a record, so it outlives a takeover the way the original would.
 */
export async function fenceOriginalOnWorker({
	commands,
	client,
}: {
	commands: TrackCommand[];
	client: TrackClient;
}): Promise<OriginalTrackFate> {
	const fates = new Set<OriginalTrackFate>();
	for (const command of commands)
		fates.add(await fenceCommand({ client, command }));
	const [fate] = fates;
	// One append carried every command to one partition, so a split verdict means something else wrote these ids.
	if (fates.size !== 1 || !fate)
		throw new SpooledTrackFateUnknownError({
			cause: new Error(
				"Fan-out commands disagree on whether the original landed",
			),
		});
	return fate;
}
