import { scenarios } from "../track-throughput/scenarios.js";
import { createCheckBench } from "./createCheckBench.js";

/** The bench app on a real socket, for `run.ts --mode=socket`; launched pinned to its own core. */
const scenario = scenarios[process.env.CHECK_BENCH_SCENARIO ?? "typical"];
if (!scenario) throw new Error("Unknown scenario");
const { app } = await createCheckBench({ scenario });
const server = Bun.serve({ port: 0, fetch: app.fetch });
console.error(`READY ${server.port}`);
