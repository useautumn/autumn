import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildEmailPlatformProducts,
	ensureEmailPlatformFeatures,
} from "./email-platform";

const getSubscription = (customer: ApiCustomerV5, planId: string) =>
	customer.subscriptions.find((sub) => sub.plan_id === planId);

test(`${chalk.yellowBright("agent: email platform customer on paid pro")}`, async () => {
	await ensureEmailPlatformFeatures();
	const { plans, featureIds } = buildEmailPlatformProducts();
	const planList = Object.values(plans);

	const { autumnV2_2, customerId } = await initScenario({
		customerId: "agent-ep-pro",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: planList }),
			s.entities({ count: 1, featureId: featureIds.projects }),
		],
		actions: [
			// Pro has no base price; email volume is a prepaid volume item. Pick the
			// first tier (50k emails for $20/mo).
			s.billing.attach({
				productId: plans.pro.id,
				options: [{ feature_id: featureIds.emails, quantity: 50_000 }],
			}),
			s.advanceTestClock({ days: 7, waitForSeconds: 15 }),
		],
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const subscription = getSubscription(customer, plans.pro.id);

	// Paid Pro: active subscription, not trialing.
	expect(subscription).toBeDefined();
	expect(subscription?.trial_ends_at).toBeFalsy();
});
