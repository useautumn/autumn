import { test } from "bun:test";
import chalk from "chalk";
import { seedKnowledgePlatformCustomers } from "./knowledge-platform";

test(`${chalk.yellowBright("agent: leaf multi-write approval customers")}`, async () => {
	const seeded = await seedKnowledgePlatformCustomers({
		attachPlan: null,
		customerCount: 4,
		idPrefix: "leaf",
	});
	console.log(
		chalk.green(
			`plans: ${Object.values(seeded.plans)
				.map((plan) => plan.id)
				.join(", ")}`,
		),
	);
	console.log(
		chalk.green(
			`customers: ${(seeded.customers as Array<{ email?: string; id: string }>)
				.map((customer) => `${customer.id} (${customer.email ?? "no email"})`)
				.join(", ")}`,
		),
	);
});
