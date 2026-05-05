import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "customer.subscription.created auto-sync + skip-sync coverage",
	tier: "domain",
	paths: ["integration/billing/stripe-webhooks/subscription-created"],
};
