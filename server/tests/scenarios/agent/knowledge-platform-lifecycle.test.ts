import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildKnowledgePlatformProducts,
	ensureKnowledgePlatformFeatures,
	withFreeTrial,
} from "./knowledge-platform";

const getSubscription = (customer: ApiCustomerV5, planId: string) =>
	customer.subscriptions.find((sub) => sub.plan_id === planId);

test(`${chalk.yellowBright("agent: knowledge platform customer mid-cycle trialing on scale")}`, async () => {
	await ensureKnowledgePlatformFeatures();
	const { plans, featureIds } = buildKnowledgePlatformProducts();
	const scaleTrial = withFreeTrial({ product: plans.scale, trialDays: 14 });
	const planList = Object.values(plans).map((plan) =>
		plan.id === plans.scale.id ? scaleTrial : plan,
	);

	const { autumnV2_2, customerId } = await initScenario({
		customerId: "agent-kp-trialing-mid-cycle",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: planList }),
			s.entities({ count: 1, featureId: featureIds.workspaces }),
		],
		actions: [
			s.billing.attach({ productId: scaleTrial.id }),
			s.advanceTestClock({ days: 7, waitForSeconds: 15 }),
		],
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const subscription = getSubscription(customer, scaleTrial.id);

	expect(subscription?.trial_ends_at).toBeGreaterThan(Date.now());
});

test(`${chalk.yellowBright("agent: knowledge platform customer on paid scale")}`, async () => {
	await ensureKnowledgePlatformFeatures();
	const { plans, featureIds } = buildKnowledgePlatformProducts();
	const planList = Object.values(plans);

	const { autumnV2_2, customerId } = await initScenario({
		customerId: "agent-kp-paid-scale",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: planList }),
			s.entities({ count: 1, featureId: featureIds.workspaces }),
		],
		actions: [
			s.billing.attach({ productId: plans.scale.id }),
			s.advanceTestClock({ days: 7, waitForSeconds: 15 }),
		],
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const subscription = getSubscription(customer, plans.scale.id);

	expect(subscription).toBeDefined();
	expect(subscription?.trial_ends_at).toBeFalsy();
});
