/**
 * Brings the I/O pool and, under arms C and D, the Kafka worker up as one listener: the pool first (it
 * owns the port), then the Kafka worker. A Kafka worker that cannot start takes the pool down with it
 * before the failure propagates, so a task never serves HTTP with no producers and no way to stop.
 * Stopping goes the other way round: the pool stops taking requests, then the producers' thread ends.
 */
type Stoppable = { stop(): Promise<void> | void };

export async function listenWithWorkers<KafkaWorker extends Stoppable>({
	ctx,
}: {
	ctx: {
		listenPool(): Promise<Stoppable>;
		/** Absent when this arm keeps its producers on the main thread. */
		startKafkaWorker?: () => Promise<KafkaWorker>;
	};
}): Promise<{ stop(): Promise<void>; kafkaWorker: KafkaWorker | null }> {
	const pool = await ctx.listenPool();
	let kafkaWorker: KafkaWorker | null = null;
	if (ctx.startKafkaWorker) {
		try {
			kafkaWorker = await ctx.startKafkaWorker();
		} catch (cause) {
			await pool.stop();
			throw cause;
		}
	}
	async function stop(): Promise<void> {
		try {
			await pool.stop();
		} finally {
			await kafkaWorker?.stop();
		}
	}
	return { stop, kafkaWorker };
}
