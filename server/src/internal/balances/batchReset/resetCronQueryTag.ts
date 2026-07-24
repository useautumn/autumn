import { planetScaleTag } from "@/db/dbUtils.js";

const RESET_CRON_WORKLOAD = "resetCronV2";

type ResetCronQuery =
	| "countEligible"
	| "deleteRollovers"
	| "expireEntitlements"
	| "hydrateContext"
	| "markInvoiceReset"
	| "scanEligible"
	| "updateBalances"
	| "upsertRollovers";

export const resetCronQueryTag = (query: ResetCronQuery) =>
	planetScaleTag({ query: `reset:${query}`, workload: RESET_CRON_WORKLOAD });
