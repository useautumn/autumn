import type { ProjectorContext } from "./types/projectorContext.js";
import type { SubjectEventConsumer } from "./types/subjectEventConsumer.js";

const LAG_LOG_INTERVAL_MS = 10_000;

const logConsumerLag = async ({
	ctx,
	consumer,
}: {
	ctx: ProjectorContext;
	consumer: SubjectEventConsumer;
}): Promise<void> => {
	const partitions = await consumer.readLag();
	const behind = partitions.filter((partition) => partition.lag > 0);

	ctx.logger.info("Ledger projector lag", {
		event: "ledger.projector_lag",
		data: {
			partitions_behind: behind.length,
			total_lag: behind.reduce((total, { lag }) => total + lag, 0),
			behind,
		},
	});
};

// Unref'd: lag reporting must never be the reason the process stays alive.
export const logConsumerLagEvery = ({
	ctx,
	consumer,
}: {
	ctx: ProjectorContext;
	consumer: SubjectEventConsumer;
}): void => {
	const ticker = setInterval(() => {
		void logConsumerLag({ ctx, consumer }).catch((error: unknown) => {
			ctx.logger.warn("Ledger projector could not read lag", {
				event: "ledger.projector_lag_failed",
				error,
			});
		});
	}, LAG_LOG_INTERVAL_MS);
	ticker.unref();
};
