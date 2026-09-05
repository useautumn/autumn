import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import type {
	PartitionReplay,
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";
import { startReplay } from "./startReplay.js";
import { markReplayUnavailable, stopReplay } from "./stopReplay.js";

export function createPartitionReplay({
	ctx,
}: {
	ctx: PartitionReplayContext;
}): PartitionReplay {
	const state: PartitionReplayState = {
		status: "created",
		position: null,
		onUnavailable: null,
		abortController: null,
		startPromise: null,
		stopPromise: null,
	};
	function startAndCatchUp(params: {
		topic: string;
		partition: number;
		onUnavailable: RuntimeUnavailableListener;
	}): Promise<void> {
		return startReplay({ ctx, state, ...params });
	}
	function stop(): Promise<void> {
		return stopReplay({ ctx, state });
	}
	function markUnavailable({ cause }: { cause: unknown }): void {
		markReplayUnavailable({ state, cause });
	}
	return { startAndCatchUp, stop, markUnavailable };
}
