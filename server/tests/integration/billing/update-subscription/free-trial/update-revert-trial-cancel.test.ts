/**
 * Update Revert Trial Then Cancel — Regression Test
 *
 * Reproduces the bug where extending a revert trial via billing.update
 * (customize.free_trial) creates a new customer product that loses the
 * on_trial_end and previous_customer_product_id fields. When the extended
 * trial is then cancelled immediately, the revert logic doesn't fire and
 * the previous plan stays permanently Paused.
 *
 * Bug timeline (mintlify / 69f0ecf77c72f1de7b555ba1):
 * 1. Attach Pro (Yearly) — Active paid plan
 * 2. Attach Enterprise trial with on_end: "revert" — Pro paused, Enterprise active
 * 3. billing.update extends Enterprise trial (customize.free_trial with on_end: revert)
 * 4. billing.update cancel_immediately Enterprise — Pro stays Paused (BUG)
 *
 * Root cause: computeCustomPlanNewCustomerProduct does not carry over
 * on_trial_end / previous_customer_product_id from the old customer product.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Extend revert trial then cancel — previous plan should be restored
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("update-revert-trial-cancel 1: extend revert trial then cancel immediately — previous plan restored")}`,
	async () => {
		const customerId = "update-revert-trial-cancel-basic";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Step 1: Attach enterprise with revert trial (2 days)
		await autumnV2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 2,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});

		// Verify: enterprise active with revert, pro paused
		const afterAttach = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCp = afterAttach.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const pausedCp = afterAttach.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(trialCp).toBeDefined();
		expect(trialCp!.status).toBe(CusProductStatus.Active);
		expect(trialCp!.on_trial_end).toBe("revert");
		expect(trialCp!.previous_customer_product_id).toBe(pausedCp!.id);
		expect(pausedCp).toBeDefined();
		expect(pausedCp!.status).toBe(CusProductStatus.Paused);

		// Step 2: Extend the trial to 104 days via billing.update (customize.free_trial)
		await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			subscription_id: trialCp!.id,
			customize: {
				free_trial: {
					duration_length: 104,
					duration_type: FreeTrialDuration.Day,
					on_end: "revert",
					card_required: false,
				},
			},
		});

		// Verify: the replacement enterprise cusProduct still has on_trial_end + previous link
		const afterUpdate = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const updatedTrialCp = afterUpdate.customer_products.find(
			(cp) =>
				cp.product_id === enterprise.id &&
				cp.status === CusProductStatus.Active,
		);

		expect(updatedTrialCp).toBeDefined();
		expect(updatedTrialCp!.on_trial_end).toBe("revert");
		expect(updatedTrialCp!.previous_customer_product_id).toBe(pausedCp!.id);

		// Step 3: Cancel enterprise immediately
		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: enterprise.id,
				cancel_action: "cancel_immediately" as const,
			},
			{ timeout: 2000 },
		);

		// Verify: pro should be restored to Active, enterprise expired
		const afterCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const cancelledEnterprise = afterCancel.customer_products.find(
			(cp) =>
				cp.product_id === enterprise.id &&
				cp.status === CusProductStatus.Expired,
		);
		const restoredPro = afterCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(cancelledEnterprise).toBeDefined();
		expect(restoredPro).toBeDefined();
		expect(restoredPro!.status).toBe(CusProductStatus.Active);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Extend revert trial then cancel — no default product created
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("update-revert-trial-cancel 2: extend revert trial then cancel — default product NOT created")}`,
	async () => {
		const customerId = "update-revert-trial-cancel-no-default";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Step 1: Attach enterprise with revert trial
		await autumnV2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 2,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});

		// Get the trial cusProduct ID for the update call
		const afterAttach = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCp = afterAttach.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		expect(trialCp).toBeDefined();

		// Step 2: Extend the trial
		await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			subscription_id: trialCp!.id,
			customize: {
				free_trial: {
					duration_length: 30,
					duration_type: FreeTrialDuration.Day,
					on_end: "revert",
					card_required: false,
				},
			},
		});

		// Step 3: Cancel enterprise immediately
		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: enterprise.id,
				cancel_action: "cancel_immediately" as const,
			},
			{ timeout: 2000 },
		);

		// Verify: pro restored, enterprise expired, NO free default created
		const afterCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const restoredPro = afterCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const cancelledEnterprise = afterCancel.customer_products.find(
			(cp) =>
				cp.product_id === enterprise.id &&
				cp.status === CusProductStatus.Expired,
		);
		const freeDefault = afterCancel.customer_products.find(
			(cp) =>
				cp.product_id === free.id && cp.status === CusProductStatus.Active,
		);

		expect(cancelledEnterprise).toBeDefined();
		expect(restoredPro).toBeDefined();
		expect(restoredPro!.status).toBe(CusProductStatus.Active);

		// The bug: without the fix, a free default IS created instead of reverting
		expect(freeDefault).toBeUndefined();
	},
);
