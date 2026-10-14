import "dotenv/config";

import cluster from "node:cluster";
import { getAutumnEnv } from "@autumn/env";

import { initInfisical } from "./external/infisical/initInfisical.js";

if (cluster.isPrimary) {
	await initInfisical();
}
getAutumnEnv();

await import("./instrumentation.js");
await import("./init.js");
