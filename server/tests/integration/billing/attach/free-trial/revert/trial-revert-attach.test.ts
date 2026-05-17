/**
 * Trial Revert — Attach Tests
 *
 * Verifies that attaching a product with on_end: "revert" correctly:
 * - Creates a new cusProduct with Trialing status
 * - Pauses the current cusProduct (not expired, not canceled)
 * - Links the trial cusProduct to the previous one via previous_customer_product_id
 * - Sets on_trial_end = "revert" on the trial cusProduct
 * - Does NOT create a Stripe subscription for the trial (card_required: false)
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	customerProducts,
	ms,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";


// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro customer → enterprise revert trial (happy path)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-attach 1: pro to enterprise revert trial — status + DB fields")}`,
	async () => {
		const customerId = "trial-revert-attach-basic";

		const messagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx, advancedTo } = await initScenario({
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

		// Query ALL statuses including Paused and Trialing
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		// Find the enterprise (trial) and pro (paused) customer products
		const trialCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const pausedCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(trialCusProduct).toBeDefined();
		expect(pausedCusProduct).toBeDefined();

		// Trial cusProduct assertions (Active status + trial_ends_at, matching existing trial behavior)
		expect(trialCusProduct!.status).toBe(CusProductStatus.Active);
		expect(trialCusProduct!.on_trial_end).toBe("revert");
		expect(trialCusProduct!.previous_customer_product_id).toBe(
			pausedCusProduct!.id,
		);
		expect(trialCusProduct!.trial_ends_at).toBeDefined();
		expect(
			Math.abs(trialCusProduct!.trial_ends_at! - (advancedTo + ms.days(14))),
		).toBeLessThan(ms.hours(1));

		// Paused cusProduct assertions
		expect(pausedCusProduct!.status).toBe(CusProductStatus.Paused);
		expect(pausedCusProduct!.canceled).toBe(false);
		expect(pausedCusProduct!.canceled_at).toBeNull();
		expect(pausedCusProduct!.ended_at).toBeNull();
		expect(pausedCusProduct!.subscription_ids?.length).toBeGreaterThan(0);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: API visibility + paused product retains data
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-attach 2: API shows trial product, paused retains data")}`,
	async () => {
		const customerId = "trial-revert-attach-retain";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, autumnV1, ctx, advancedTo } = await initScenario({
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

		// Verify DB-level state
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const pausedPro = fullCustomer.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const trialEnterprise = fullCustomer.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);

		expect(pausedPro).toBeDefined();
		expect(trialEnterprise).toBeDefined();

		// Paused pro should retain its customer_prices and customer_entitlements
		expect(pausedPro!.customer_prices.length).toBeGreaterThan(0);
		expect(pausedPro!.customer_entitlements.length).toBeGreaterThan(0);

		// Trial enterprise should have its own customer_entitlements and correct trial_ends_at
		expect(trialEnterprise!.customer_entitlements.length).toBeGreaterThan(0);
		expect(trialEnterprise!.trial_ends_at).toBeDefined();
		expect(
			Math.abs(trialEnterprise!.trial_ends_at! - (advancedTo + ms.days(14))),
		).toBeLessThan(ms.hours(1));
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: on_end: "bill" keeps normal behavior (regression check)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-attach 3: on_end bill — previous plan expired, not paused")}`,
	async () => {
		const customerId = "trial-revert-attach-bill";

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
					on_end: "bill",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const proCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const enterpriseCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);

		expect(enterpriseCusProduct).toBeDefined();
		expect(proCusProduct).toBeDefined();

		// on_end: "bill" should NOT pause the previous plan — it should be expired
		expect(proCusProduct!.status).toBe(CusProductStatus.Expired);
		expect(proCusProduct!.canceled).toBe(true);

		// Enterprise should be active (not Trialing status), on_trial_end should be null
		expect(enterpriseCusProduct!.status).toBe(CusProductStatus.Active);
		expect(enterpriseCusProduct!.on_trial_end).toBeNull();
		expect(enterpriseCusProduct!.previous_customer_product_id).toBeNull();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cross-entity revert — pro on entity 1, enterprise revert on entity 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) on entity 1 with a Stripe subscription
 * - Attach enterprise with on_end: "revert" on entity 2
 *
 * Expected:
 * - Pro on entity 1 stays active (not paused -- different entity)
 * - Enterprise trial on entity 2 has no previous_customer_product_id
 * - Trial expires to nothing on entity 2
 */
test.concurrent(
	`${chalk.yellowBright("trial-revert-attach 4: cross-entity revert — pro on entity 1, enterprise revert on entity 2")}`,
	async () => {
		const customerId = "trial-revert-cross-entity";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			],
		});

		// Attach enterprise with revert trial on entity 2
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			entity_id: entities[1].id,
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

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
			withEntities: true,
		});

		// Find pro on entity 1 and enterprise on entity 2
		const proCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === pro.id && cp.entity_id === entities[0].id,
		);
		const enterpriseCusProduct = fullCustomer.customer_products.find(
			(cp) =>
				cp.product_id === enterprise.id && cp.entity_id === entities[1].id,
		);

		expect(proCusProduct).toBeDefined();
		expect(enterpriseCusProduct).toBeDefined();

		// Pro on entity 1 stays active (different entity, not paused)
		expect(proCusProduct!.status).toBe(CusProductStatus.Active);

		// Enterprise on entity 2: revert trial with no previous product link
		expect(enterpriseCusProduct!.status).toBe(CusProductStatus.Active);
		expect(enterpriseCusProduct!.on_trial_end).toBe("revert");
		expect(enterpriseCusProduct!.previous_customer_product_id).toBeNull();
		expect(enterpriseCusProduct!.trial_ends_at).toBeDefined();
	},
);
