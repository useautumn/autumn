import { getAutumnEnv } from "@autumn/env";
import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();
getAutumnEnv();
await import("./main.js");
