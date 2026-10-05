import { createBenchWorker } from "./createBenchWorker.js";

/** PORT HTTP_WORKERS INLINE=on|off; prints `listening` once the pool is bound. */
const worker = await createBenchWorker({
	port: Number(process.env.PORT ?? 8093),
	httpWorkers: Number(process.env.HTTP_WORKERS ?? 1),
	inline: process.env.INLINE !== "off",
});
console.error("listening");
process.on("SIGTERM", () => {
	void worker.stop().finally(() => process.exit(0));
});
