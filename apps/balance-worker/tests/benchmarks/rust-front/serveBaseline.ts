import { type AppenderMode, createSpikeWorker } from "./createSpikeWorker.js";

/** (a) today's worker: Bun.serve with the thin fast path in front of the partition processor. */
const appenderMode = (process.env.SPIKE_APPENDER ?? "kafkajs") as AppenderMode;
const port = Number(process.env.SPIKE_PORT ?? 8091);
const worker = await createSpikeWorker({ appenderMode });
Bun.serve({
	hostname: "127.0.0.1",
	port,
	maxRequestBodySize: 1_000_000,
	fetch: worker.fetch,
	idleTimeout: 0,
});
console.error(`baseline listening on ${port} (appender ${appenderMode})`);

process.on("SIGTERM", () => process.exit(0));
