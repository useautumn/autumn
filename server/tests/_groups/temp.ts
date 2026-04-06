import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Subscription updated past due tests",
	tier: "domain",
	paths: [
		"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-past-due.test.ts",
		"integration/billing/update-subscription/custom-plan/update-oneoff-no-quantity.test.ts",
		"integration/others/rate-limits/rate-limit-hot-paths.test.ts",
		"integration/others/rate-limits/rate-limit-list-customers.test.ts",
		"unit/rate-limits/get-rate-limit-type.test.ts",
	],
};
