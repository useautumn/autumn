import type { CommitterDb } from "../types/committerDb.js";
import { applyDurableMutations } from "./actions/applyDurableMutations.js";
import {
	initializePartition,
	loadProgress,
} from "./actions/partitionProgress.js";
import { createProgressMirror } from "./repos/progressMirror.js";
import type { Committer, CommitterStateStore } from "./types/committer.js";
import type { CommitterStateStoreContext } from "./types/committerStateStoreContext.js";

/** Reads answer null: the writer's map holds every subject this backend knows. */
export const createCommitterStateStore = ({
	ctx: dependencies,
}: {
	ctx: {
		committer: Committer;
		db: Pick<CommitterDb, "readNextOffset" | "insertPartitionProgress">;
	};
}): CommitterStateStore => {
	const ctx: CommitterStateStoreContext = {
		...dependencies,
		progress: createProgressMirror(),
	};
	// The writer and the follower both apply; one lane per partition keeps the bookmark honest.
	const laneByPartition = new Map<string, Promise<unknown>>();
	const applyInLane: CommitterStateStore["applyDurableMutations"] = ({
		records,
	}) => {
		const first = records[0];
		if (!first) return Promise.resolve([]);
		const key = `${first.position.topic}[${first.position.partition}]`;
		const previous = laneByPartition.get(key) ?? Promise.resolve();
		const run = previous
			.catch(() => undefined)
			.then(() => applyDurableMutations({ ctx, records }));
		laneByPartition.set(key, run);
		return run;
	};

	return {
		baseline: "map",
		loadProgress: (params) => loadProgress({ ctx, ...params }),
		initializePartition: (params) => initializePartition({ ctx, ...params }),
		readNextOffset: (params) => ctx.progress.readNextOffset(params),
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: applyInLane,
		close: () => ctx.committer.stop(),
	};
};
