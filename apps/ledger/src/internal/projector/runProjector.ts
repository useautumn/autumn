import { applyEntryBatch } from "./applyEntryBatch.js";
import { logConsumerLagEvery } from "./logConsumerLagEvery.js";
import type { ProjectorContext } from "./types/projectorContext.js";
import type { SubjectEventConsumer } from "./types/subjectEventConsumer.js";

// A shard that only replays: no writer loop, no clock. Every batch is decoded,
// grouped by customer, and folded into Postgres before its offsets are committed.
export const runProjector = async ({
	ctx,
	consumer,
}: {
	ctx: ProjectorContext;
	consumer: SubjectEventConsumer;
}): Promise<void> => {
	logConsumerLagEvery({ ctx, consumer });

	await consumer.start({
		onBatch: ({ batch }) => applyEntryBatch({ ctx, batch }),
	});

	ctx.logger.info("Ledger projector consuming", {
		event: "ledger.projector_started",
	});
};
