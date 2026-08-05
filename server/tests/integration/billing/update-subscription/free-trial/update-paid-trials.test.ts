import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Paid-to-Paid with Trial Tests (slice 1 of 2)
 *
 * Tests for scenarios involving paid products with trials - removing, updating, and preserving trials.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Remove trial while running (free_trial: null)
test.concurrent(
	`${chalk.yellowBright("p2p-trial: remove trial while running")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			items: [messagesItem],
			id: "pro-trial",
			trialDays: 14,
		});

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "p2p-remove-trial-active",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		// Remove the trial by passing free_trial: null
		const updateParams = {
			customer_id: customerId,
			product_id: proTrial.id,
			free_trial: null,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should charge full price since trial is being removed
		expect(preview.total).toEqual(20);

		// When trial is removed, next_cycle should start in ~1 month (regular billing)
		expectPreviewNextCycleCorrect({
			preview,
			expectDefined: false,
		});

		await autumnV1.subscriptions.update(updateParams, { timeout: 5000 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Product should no longer be trialing (use advancedTo for test clock time)
		await expectProductNotTrialing({
			customer,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		// Should now be active (not trialing)
		await expectProductActive({
			customer,
			productId: proTrial.id,
		});

		// Invoice should have been created with full price
		expectCustomerInvoiceCorrect({
			customer,
			count: 2, // Initial $0 trial invoice + $20 charge
			latestTotal: 20,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			flags: {
				checkNotTrialing: true,
			},
		});
	},
);

// 2. Remove trial after ended (should be no-op)
test.concurrent(
	`${chalk.yellowBright("p2p-trial: remove trial after ended (no-op)")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			items: [messagesItem],
			id: "pro-trial",
			trialDays: 7,
		});

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "p2p-remove-trial-ended",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 14 }), // Advance to trial end
			],
		});

		// After advancing, product should no longer be trialing
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotTrialing({
			customer: customerAfterAdvance,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		// Now try to remove trial (should be no-op since trial already ended)
		const updateParams = {
			customer_id: customerId,
			product_id: proTrial.id,
			free_trial: null,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No change expected
		expect(preview.total).toEqual(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Still not trialing
		await expectProductNotTrialing({
			customer,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			flags: {
				checkNotTrialing: true,
			},
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2, // Initial $0 trial invoice + $20 charge for trial ending
		});
	},
);

// 3. Trial carries over (free_trial: undefined)
test.concurrent(
	`${chalk.yellowBright("p2p-trial: trial carries over when undefined")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			items: [messagesItem],
			id: "pro-trial",
			trialDays: 14,
		});

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "p2p-trial-carryover",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		// Verify initially trialing
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer: customerBefore,
			productId: proTrial.id,
		});
		const initialTrialEnd = customerBefore.products?.find(
			(p) => p.id === proTrial.id,
		)?.current_period_end;

		// Update WITHOUT specifying free_trial (undefined) - should preserve trial
		const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: proTrial.id,
			items: [updatedMessagesItem, items.monthlyPrice()],
			// free_trial is NOT specified (undefined)
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should be 0 during trial
		expect(preview.total).toEqual(0);

		// next_cycle should align with existing trial (~7 days remaining from 14-day trial after 7 days advanced)
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: advancedTo + ms.days(7),
			total: items.monthlyPrice().price!,
		});

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Trial should be preserved
		await expectProductTrialing({
			customer,
			productId: proTrial.id,
		});

		// Verify trial end is the same
		const newTrialEnd = customer.products?.find(
			(p) => p.id === proTrial.id,
		)?.current_period_end;
		expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(60000);

		// Feature updated
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: updatedMessagesItem.included_usage,
			balance: updatedMessagesItem.included_usage,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
