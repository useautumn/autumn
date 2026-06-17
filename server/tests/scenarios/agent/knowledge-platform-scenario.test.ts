import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import chalk from "chalk";
import {
	initKnowledgePlatformScenario,
	knowledgePlatformFeatureIds,
	seedKnowledgePlatformCustomers,
} from "./knowledge-platform";

test(`${chalk.yellowBright("agent: knowledge platform setup with products, features, and entities")}`, async () => {
	const { autumnV2_2, customerId, entities, plans } =
		await initKnowledgePlatformScenario({
			customerId: "agent-knowledge-platform-smoke",
			attachPlan: "trial",
			entityCount: 2,
		});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const planIds = customer.subscriptions.map(
		(subscription) => subscription.plan_id,
	);

	expect(planIds).toContain(plans.trial.id);
	expect(entities).toHaveLength(2);
	expect(entities[0].featureId).toBe(knowledgePlatformFeatureIds.workspaces);
});

const seedTest =
	process.env.SEED_KNOWLEDGE_PLATFORM_CUSTOMERS === "true" ? test : test.skip;

seedTest(
	`${chalk.yellowBright("agent: seed knowledge platform org with realistic customers")}`,
	async () => {
		const customerCount = Number(
			process.env.KNOWLEDGE_PLATFORM_CUSTOMER_COUNT ?? "1000",
		);
		const result = await seedKnowledgePlatformCustomers({ customerCount });

		expect(result.customerCount).toBe(customerCount);
		expect(result.entityCount).toBeGreaterThanOrEqual(customerCount);
	},
);
