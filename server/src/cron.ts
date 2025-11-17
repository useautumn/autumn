import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();

await import("./cron/cronInit.js");
