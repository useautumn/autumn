import type { PartitionPosition, PartitionProgress } from "@autumn/kafka";
import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import type {
	PartitionReplay,
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";
import { readReplayLogRange, startReplay } from "./startReplay.js";
import { markReplayUnavailable, stopReplay } from "./stopReplay.js";

export function createPartitionReplay({
	ctx,
	position,
}: {
	ctx: PartitionReplayContext;
	position: PartitionPosition;
}): PartitionReplay {
	const state: PartitionReplayState = {
		status: "created",
		position,
		onUnavailable: null,
		abortController: null,
		startPromise: null,
		stopPromise: null,
	};

	function readLogRange(params: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}) {
		return readReplayLogRange({ ctx, ...params });
	}

	function startAndCatchUp(params: {
		topic: string;
		partition: number;
		targetNextOffset: bigint;
		onUnavailable: RuntimeUnavailableListener;
	}): Promise<void> {
		return startReplay({ ctx, state, ...params });
	}

	function readProgress(position: PartitionPosition): PartitionProgress {
		return ctx.positionTracker.readProgress(position);
	}

	function stop(): Promise<void> {
		return stopReplay({ ctx, state });
	}

	function markUnavailable({ cause }: { cause: unknown }): void {
		markReplayUnavailable({ state, cause });
	}

	return { readLogRange, startAndCatchUp, readProgress, stop, markUnavailable };
}
