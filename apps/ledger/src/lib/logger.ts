import { createAppLogger } from "@autumn/logging";
import { env } from "./env.js";

export const logger = createAppLogger({
	service: "ledger",
	dataset: env.LEDGER_LOG_DATASET,
	preset: "firelens",
});
