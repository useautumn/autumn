import type { TestGroup } from "../types";

export const webhooks: TestGroup = {
	name: "webhooks",
	description: "Stripe and Autumn webhook handlers",
	tier: "domain",
	maxConcurrency: 3,
	paths: [],
};
