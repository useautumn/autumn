import type { BatchTrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { runBalanceWorkerBatchTrack } from "./balanceWorker/runBalanceWorkerBatchTrack.js";
import { type BatchTrackEntry, toBatchTrackEntries } from "./batchTrackEntries.js";
import { runBatchTrack } from "./runBatchTrack.js";

const partitionByRollout = ({
	ctx,
	entries,
}: {
	ctx: AutumnContext;
	entries: BatchTrackEntry[];
}): { worker: BatchTrackEntry[]; legacy: BatchTrackEntry[] } => {
	const worker: BatchTrackEntry[] = [];
	const legacy: BatchTrackEntry[] = [];
	for (const entry of entries) {
		const routed = isBalanceWorkerRolloutEnabled({
			ctx,
			customerId: entry.item.customer_id,
		});
		(routed ? worker : legacy).push(entry);
	}
	return { worker, legacy };
};

/** A batch names many customers, so each item is routed on its own; the two lanes then run side by side. */
export const runBatchTrackByRollout = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: BatchTrackParams;
}): Promise<void> => {
	const { worker, legacy } = partitionByRollout({
		ctx,
		entries: toBatchTrackEntries({ body }),
	});
	await Promise.all([
		worker.length > 0 && runBalanceWorkerBatchTrack({ ctx, entries: worker }),
		legacy.length > 0 && runBatchTrack({ ctx, entries: legacy }),
	]);
};
