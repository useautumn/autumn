/**
 * Trial Revert — Expiry Tests
 *
 * Verifies the product cron correctly handles expired revert trials:
 * - Expires the trial cusProduct
 * - Unpauses the previous cusProduct (back to Active)
 * - Does NOT activate a free default product (revert skips that path)
 * - Regular (non-revert) trial expiry still works normally alongside
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { db } from "@/db/initDrizzle";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";

const ALL_STATUSES_WITH_PAUSED = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
	CusProductStatus.Expired,
	CusProductStatus.Paused,
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Revert trial expires → previous plan unpaused
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro plan → attach enterprise with on_end: "revert"
 * - Manually set trial_ends_at to the past
 * - Run product cron
 *
 * Expected:
 * - Enterprise cusProduct → Expired
 * - Pro cusProduct → Active (unpaused)
 * - Pro retains its subscription_ids
 */
test(
	`${chalk.yellowBright("trial-revert-expiry 1: cron expires trial and unpauses previous plan")}`,
	async () => {
		const customerId = "trial-revert-expiry-basic";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach enterprise with revert trial
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		// Verify initial state — enterprise trialing, pro paused
		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const trialCusProduct = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const pausedCusProduct = beforeCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(trialCusProduct).toBeDefined();
		expect(pausedCusProduct).toBeDefined();
		expect(trialCusProduct!.status).toBe(CusProductStatus.Active);
		expect(pausedCusProduct!.status).toBe(CusProductStatus.Paused);

		const proSubscriptionIds = pausedCusProduct!.subscription_ids;

		// Set trial_ends_at to the past to simulate expiry
		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCusProduct!.id));

		// Run the product cron
		await runProductCron({ ctx: { db, logger } });

		// Verify after cron — enterprise expired, pro active
		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const expiredTrialCp = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const restoredProCp = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(expiredTrialCp).toBeDefined();
		expect(restoredProCp).toBeDefined();

		// Trial cusProduct should be expired
		expect(expiredTrialCp!.status).toBe(CusProductStatus.Expired);

		// Pro cusProduct should be restored to active
		expect(restoredProCp!.status).toBe(CusProductStatus.Active);
		expect(restoredProCp!.canceled).toBe(false);
		expect(restoredProCp!.ended_at).toBeNull();

		// Stripe subscription should still be intact
		expect(restoredProCp!.subscription_ids).toEqual(proSubscriptionIds);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Non-revert trial still expires normally (regression)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free plan → attach free trial product (on_end: "bill" / default)
 * - Manually expire trial
 * - Run product cron
 *
 * Expected:
 * - Trial product → Expired
 * - Free default product activated (existing behavior, not revert)
 */
test(
	`${chalk.yellowBright("trial-revert-expiry 2: non-revert trial expires normally (regression)")}`,
	async () => {
		const customerId = "trial-revert-expiry-regression";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [freeMessages],
		});

		const trialMessages = items.monthlyMessages({ includedUsage: 500 });
		const trialProduct = products.baseWithTrial({
			id: "trial-product",
			items: [trialMessages],
			trialDays: 7,
			cardRequired: false,
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free, trialProduct] }),
			],
			actions: [s.billing.attach({ productId: trialProduct.id })],
		});

		// Find the trial cusProduct
		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const trialCp = beforeCron.customer_products.find(
			(cp) => cp.product_id === trialProduct.id,
		);
		expect(trialCp).toBeDefined();
		expect(trialCp!.on_trial_end).toBeNull();

		// Set trial_ends_at to past
		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCp!.id));

		await runProductCron({ ctx: { db, logger } });

		// Verify — trial expired, free default activated
		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const expiredTrialCp = afterCron.customer_products.find(
			(cp) => cp.product_id === trialProduct.id,
		);
		const defaultCp = afterCron.customer_products.find(
			(cp) => cp.product_id === free.id,
		);

		expect(expiredTrialCp).toBeDefined();
		expect(expiredTrialCp!.status).toBe(CusProductStatus.Expired);

		expect(defaultCp).toBeDefined();
		expect(defaultCp!.status).toBe(CusProductStatus.Active);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Revert trial does NOT activate free default product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Org has a free default product
 * - Customer on pro → enterprise revert trial
 * - Trial expires via cron
 *
 * Expected:
 * - Pro is unpaused (Active)
 * - Enterprise is Expired
 * - Free default is NOT activated (revert takes precedence)
 */
test(
	`${chalk.yellowBright("trial-revert-expiry 3: revert does NOT activate free default")}`,
	async () => {
		const customerId = "trial-revert-expiry-no-default";

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

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach enterprise with revert trial
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		// Find trial cusProduct and set trial_ends_at to past
		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const trialCp = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		expect(trialCp).toBeDefined();

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCp!.id));

		await runProductCron({ ctx: { db, logger } });

		// Verify — pro restored, enterprise expired, free default NOT activated
		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const restoredPro = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const expiredEnterprise = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const freeDefault = afterCron.customer_products.find(
			(cp) => cp.product_id === free.id,
		);

		expect(restoredPro).toBeDefined();
		expect(restoredPro!.status).toBe(CusProductStatus.Active);

		expect(expiredEnterprise).toBeDefined();
		expect(expiredEnterprise!.status).toBe(CusProductStatus.Expired);

		// Free default should NOT have been activated since we reverted to pro
		expect(freeDefault).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Revert skips restore if previous plan was expired during trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro → enterprise revert trial
 * - During trial, the paused pro product's status is changed to Expired
 *   (simulating a Stripe webhook cancelling the underlying subscription)
 * - Trial expires via cron
 *
 * Expected:
 * - Enterprise trial is Expired
 * - Pro stays Expired (NOT reactivated — the Paused guard prevents it)
 */
test(
	`${chalk.yellowBright("trial-revert-expiry 4: skips restore if previous plan expired during trial")}`,
	async () => {
		const customerId = "trial-revert-expiry-expired-prev";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		// Find the paused pro product and simulate a Stripe webhook expiring it
		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const pausedPro = beforeCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const trialEnterprise = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);

		expect(pausedPro).toBeDefined();
		expect(pausedPro!.status).toBe(CusProductStatus.Paused);
		expect(trialEnterprise).toBeDefined();

		// Simulate: Stripe webhook expired the paused plan during the trial
		await db
			.update(customerProducts)
			.set({ status: CusProductStatus.Expired })
			.where(eq(customerProducts.id, pausedPro!.id));

		// Set trial_ends_at to past to trigger cron
		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialEnterprise!.id));

		await runProductCron({ ctx: { db, logger } });

		// Verify: trial expired, pro stays expired (NOT reactivated)
		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES_WITH_PAUSED,
		});

		const expiredEnterprise = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const expiredPro = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(expiredEnterprise).toBeDefined();
		expect(expiredEnterprise!.status).toBe(CusProductStatus.Expired);

		expect(expiredPro).toBeDefined();
		expect(expiredPro!.status).toBe(CusProductStatus.Expired);
	},
);
