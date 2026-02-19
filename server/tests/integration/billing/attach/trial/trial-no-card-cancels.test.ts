import { expect, test } from "bun:test";
import { type ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Trial No-Card Cancellation Tests
 *
 * Regression tests for the bug where free trial subscriptions (no card required)
 * would go past_due instead of being canceled when the trial ends.
 *
 * Root causes:
 * 1. createStripeSub2.ts used `allow_incomplete` instead of `default_incomplete`
 * 2. buildStripeCheckoutSessionAction.ts had inverted cardRequired condition
 *
 * These tests verify that trials without payment methods are properly canceled
 * when the trial period ends.
 */

// 1. Pro trial (no card) should cancel after trial ends
test.concurrent(
	`${chalk.yellowBright("trial-no-card: pro trial cancels when trial ends without payment method")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.proWithTrial({
			items: [messagesItem],
			id: "pro-nocard",
			trialDays: 7,
			cardRequired: false,
		});
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
			isDefault: true,
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "trial-nocard-cancel",
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Verify product is trialing
		await expectProductTrialing({
			customerId,
			productId: pro.id,
		});

		// Advance past trial end (7 days + buffer for Stripe processing)
		const { autumnV1: autumnAfter, advancedTo: afterAdvance } =
			await initScenario({
				customerId: "trial-nocard-cancel",
				setup: [
					s.customer({ testClock: true }),
					s.products({ list: [free, pro] }),
				],
				actions: [
					s.attach({ productId: pro.id }),
					s.advanceTestClock({ days: 8 }),
				],
			});

		// Pro should be canceled (not past_due!) since there's no payment method
		const customer =
			await autumnAfter.customers.get<ApiCustomerV3>("trial-nocard-cancel");

		const proProduct = customer.products?.find(
			(p: { id?: string }) => p.id === pro.id,
		);

		// The product should either be canceled or not present (reverted to free)
		if (proProduct) {
			expect(
				proProduct.status,
				`Pro trial should be canceled after trial ends without card, but got "${proProduct.status}". ` +
					`This is the regression case - allow_incomplete causes past_due instead of cancellation.`,
			).toBe("canceled");
		}

		// Free default product should be active
		await expectCustomerProductCorrect({
			customer,
			productId: free.id,
			state: "active",
		});
	},
);

// 2. Pro trial WITH card should remain active after trial ends
test.concurrent(
	`${chalk.yellowBright("trial-with-card: pro trial continues when trial ends with payment method")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.proWithTrial({
			items: [messagesItem],
			id: "pro-card",
			trialDays: 7,
			cardRequired: false,
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "trial-card-active",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 8 }),
			],
		});

		// With a valid payment method, pro should transition to active (not canceled)
		const customer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const proProduct = customer.products?.find(
			(p: { id?: string }) => p.id === pro.id,
		);

		expect(
			proProduct,
			"Pro product should still exist after trial ends with valid card",
		).toBeDefined();

		expect(
			proProduct!.status,
			`Pro should be active after trial ends with valid card, but got "${proProduct!.status}"`,
		).toBe("active");

		await expectProductNotTrialing({
			customer,
			productId: pro.id,
		});
	},
);

// 3. Pro trial (no card) - verify it's trialing during the trial period
test.concurrent(
	`${chalk.yellowBright("trial-no-card: verify trialing state during trial period")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.proWithTrial({
			items: [messagesItem],
			id: "pro-trial-state",
			trialDays: 7,
			cardRequired: false,
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "trial-nocard-state",
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Should be trialing immediately after attach
		await expectProductTrialing({
			customerId,
			productId: pro.id,
		});

		// Customer should have access to features during trial
		const customer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(
			customer.features?.[TestFeature.Messages],
			"Messages feature should be available during trial",
		).toBeDefined();
	},
);
