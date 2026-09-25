import type { CommitterDb } from "../types/committerDb.js";
import { applyDurableMutations } from "./actions/applyDurableMutations.js";
import {
	advanceCommandNextOffset as advanceCommandProgress,
	advanceOwnerFence as advanceOwnerFenceProgress,
	initializePartition,
	loadProgress,
} from "./actions/partitionProgress.js";
import { createProgressMirror } from "./repos/progressMirror.js";
import type {
	Committer,
	CommitterStateStore,
	PartitionPosition,
} from "./types/committer.js";
import type { CommitterStateStoreContext } from "./types/committerStateStoreContext.js";

/** Reads answer null: the writer's map holds every subject this backend knows. */
export const createCommitterStateStore = ({
	ctx: dependencies,
}: {
	ctx: {
		committer: Committer;
		db: Pick<CommitterDb, "readPartitionProgress" | "insertPartitionProgress">;
	};
}): CommitterStateStore => {
	const ctx: CommitterStateStoreContext = {
		...dependencies,
		progress: createProgressMirror(),
	};
	// Replay, writer applies and command-only bookmarks share one lane per partition.
	const laneByPartition = new Map<string, Promise<unknown>>();
	function runInLane<Result>({
		position,
		run,
	}: {
		position: PartitionPosition;
		run(): Promise<Result>;
	}): Promise<Result> {
		const key = `${position.topic}[${position.partition}]`;
		const previous = laneByPartition.get(key) ?? Promise.resolve();
		const operation = previous.catch(() => undefined).then(run);
		laneByPartition.set(key, operation);
		return operation;
	}

	const applyInLane: CommitterStateStore["applyDurableMutations"] = ({
		records,
	}) => {
		const first = records[0];
		if (!first) return Promise.resolve([]);
		return runInLane({
			position: first.position,
			run: () => applyDurableMutations({ ctx, records }),
		});
	};

	function advanceCommandNextOffset(
		params: Parameters<CommitterStateStore["advanceCommandNextOffset"]>[0],
	): Promise<void> {
		return runInLane({
			position: params,
			run: () => advanceCommandProgress({ ctx, ...params }),
		});
	}
	function advanceOwnerFence(
		params: Parameters<
			NonNullable<CommitterStateStore["advanceOwnerFence"]>
		>[0],
	): Promise<void> {
		return runInLane({
			position: params,
			run: () => advanceOwnerFenceProgress({ ctx, ...params }),
		});
	}
	function readOwnerFence(params: PartitionPosition) {
		return ctx.progress.readOwnerFence(params);
	}
	function loadPartitionProgress(params: PartitionPosition) {
		return loadProgress({ ctx, ...params });
	}
	function initialize(
		params: Parameters<CommitterStateStore["initializePartition"]>[0],
	) {
		return initializePartition({ ctx, ...params });
	}
	function readNextOffset(params: PartitionPosition) {
		return ctx.progress.readNextOffset(params);
	}
	function readCommandNextOffset(params: PartitionPosition) {
		return ctx.progress.readCommandNextOffset(params);
	}
	function readAbsent(): null {
		return null;
	}
	function close() {
		ctx.committer.stop();
	}

	return {
		baseline: "map",
		advanceCommandNextOffset,
		loadProgress: loadPartitionProgress,
		initializePartition: initialize,
		readNextOffset,
		readCommandNextOffset,
		readOwnerFence,
		advanceOwnerFence,
		readState: readAbsent,
		readOwnState: readAbsent,
		readReceipt: readAbsent,
		applyDurableMutations: applyInLane,
		close,
	};
};
