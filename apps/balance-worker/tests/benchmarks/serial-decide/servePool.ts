import { createIoWorkerPool } from "../../../src/serialDecide/createIoWorkerPool.js";
import {
	type AppenderMode,
	createSpikeWorker,
} from "../rust-front/createSpikeWorker.js";

/** Today's worker behind the production I/O worker pool (serial-decide arm B): same fetch, HTTP on worker threads. */
const appenderMode = (process.env.SPIKE_APPENDER ?? "kafkajs") as AppenderMode;
const port = Number(process.env.SPIKE_PORT ?? 8091);
const workers = Number(process.env.IO_WORKERS ?? 2);
const worker = await createSpikeWorker({ appenderMode });
const pool = createIoWorkerPool({
	ctx: {
		fetch: worker.fetch,
		logger: { info: console.error, warn: console.error, error: console.error },
		onFatal: ({ cause }) => {
			console.error(`FATAL ${String(cause)}`);
			process.exit(1);
		},
	},
	config: {
		hostname: "127.0.0.1",
		port,
		maxRequestBodySize: 1_000_000,
		workers,
	},
});
const listener = await pool.listen();
console.error(
	`pool listening on ${listener.port} with ${workers} I/O workers (appender ${appenderMode})`,
);
setInterval(
	() => console.error(`STATS ${JSON.stringify(pool.readStats())}`),
	5000,
).unref();
process.on("SIGTERM", () => {
	console.error(`FINAL ${JSON.stringify(pool.readStats())}`);
	process.exit(0);
});
