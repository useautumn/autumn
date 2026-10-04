import { type Arm, createArmWorker } from "./createArmWorker.js";

/** One production serial-decide arm on the spike's fixtures: ARM=A|B|C|D SPIKE_PORT IO_WORKERS. */
const arm = (process.env.ARM ?? "A") as Arm;
if (!["A", "B", "C", "D"].includes(arm))
	throw new Error(`ARM must be A, B, C or D; got ${arm}`);
const port = Number(process.env.SPIKE_PORT ?? 8093);
const ioWorkers = Number(process.env.IO_WORKERS ?? 2);
const worker = await createArmWorker({ arm, port, ioWorkers });
const listener = await worker.listen();
console.error(
	`arm ${arm} listening on ${port}${arm === "A" ? "" : ` with ${ioWorkers} I/O workers`}`,
);
setInterval(
	() => console.error(`STATS ${JSON.stringify(worker.readStats())}`),
	5000,
).unref();
process.on("SIGTERM", () => {
	console.error(`FINAL ${JSON.stringify(worker.readStats())}`);
	void Promise.resolve(listener.stop()).finally(() => process.exit(0));
});
