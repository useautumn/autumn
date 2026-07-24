import type { TestGroup } from "../types";

export const coreBatchReset: TestGroup = {
	name: "core-batch-reset",
	description:
		"V2 batch reset cron tests: scan eligibility, worker resets, skips, rollovers, cache invalidation",
	tier: "core",
	paths: ["integration/cron/batch-reset-v2"],
};
