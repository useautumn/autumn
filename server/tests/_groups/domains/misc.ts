import type { TestGroup } from "../types";

export const misc: TestGroup = {
	name: "misc",
	description:
		"Cron jobs, external PSPs, scenarios, rate limits, archived tests",
	tier: "domain",
	paths: [
		"integration/cron",
		"integration/external-psps",
		"integration/misc",
		"scenarios",
		"archives",
		"integration/others/rate-limits",
	],
};
