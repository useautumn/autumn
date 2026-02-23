/**
 * Legacy Checkout Advanced Tests
 *
 * Migrated from:
 * - server/tests/attach/checkout/checkout4.test.ts (coupon/reward checkout)
 * - server/tests/attach/checkout/checkout8.test.ts (prepaid with quantity=0)
 * - server/tests/attach/upgrade/upgrade7.test.ts (force checkout after cancel)
 *
 * Tests V1 attach behavior with advanced checkout scenarios:
 * - Coupons/rewards with percentage discounts
 * - Prepaid items with quantity=0 edge case
 * - Force checkout upgrade after cancel
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, RewardType } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Coupon/reward checkout
// (from checkout4)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - 50% discount coupon applied
//
// Expected:
// - Customer has Pro active
// - 1 invoice for $10 (50% of $20)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout-adv 1: coupon/reward checkout")}`, async () => {
	const customerId = "legacy-checkout-adv-1";
	const rewardId = "legacycheckoutadv1reward";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const reward = constructCoupon({
		id: rewardId,
		promoCode: "LEGACYCHECKOUTADV1",
		discountType: RewardType.PercentageDiscount,
		discountValue: 50,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	// reward.id is modified in place by s.reward (suffixed with productPrefix)
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		reward: reward.id,
	});

	await completeStripeCheckoutFormV2({ url: res.checkout_url });
	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10, // 50% of $20
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid with quantity=0
// (from checkout8)
//
// Scenario:
// - Pro product ($20/month) with two one-off prepaid items:
//   - Messages: $5/100 units
//   - Words: $10/100 units
// - Attach with options: Messages quantity=0, Words quantity=4 (400 units)
//
// Expected:
// - Customer has Pro active
// - 1 invoice for $20 (base) + $40 (4x $10 for Words) = $60
// - Messages balance = 0
// - Words balance = 400
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout-adv 2: prepaid with quantity=0")}`, async () => {
	const customerId = "legacy-checkout-adv-2";

	const messagesItem = items.oneOffMessages({
		price: 5,
		billingUnits: 100,
		includedUsage: 0,
	});
	const wordsItem = items.oneOffWords({
		price: 10,
		billingUnits: 100,
		includedUsage: 0,
	});
	const pro = products.pro({
		id: "pro",
		items: [messagesItem, wordsItem],
	});

	const options = [
		{ feature_id: TestFeature.Messages, quantity: 0 },
		{ feature_id: TestFeature.Words, quantity: 400 },
	];

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options,
	});

	await completeStripeCheckoutFormV2({ url: res.checkout_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 60, // $20 base + $40 (4 x $10 for Words)
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 400,
		balance: 400, // 4 packs x 100 units
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Force checkout upgrade after cancel
// (from upgrade7)
//
// Scenario:
// - Pro product ($20/month) with no items
// - Premium product ($50/month) with no items
// - Attach Pro, then cancel immediately, then attach Premium with force_checkout
//
// Expected:
// - Customer has Premium active after flow
// - 2 invoices (Pro + Premium)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout-adv 3: force checkout upgrade after cancel")}`, async () => {
	const customerId = "legacy-checkout-adv-3";

	const pro = products.pro({ id: "pro", items: [] });
	const premium = products.premium({ id: "premium", items: [] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	// Attach Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterPro = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPro,
		active: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPro,
		count: 1,
		latestTotal: 20, // Pro $20
	});

	// Cancel Pro immediately
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		cancel_immediately: true,
	});

	const customerAfterCancel = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		active: [],
	});

	// Attach Premium with force_checkout
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		force_checkout: true,
	});

	await completeStripeCheckoutFormV2({ url: res.checkout_url });

	const customerAfterPremium = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 50, // Premium $50
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Separate subscriptions due to force checkout (per entity)
// (from separate2)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - Premium product ($50/month) with Messages (100 included)
// - Credits add-on (prepaid, $10/100 units)
// - 2 entities, attach Pro to each with force_checkout (separate checkouts)
// - Upgrade both to Premium
// - Attach add-on to entity 2 (should use entity 2's subscription)
//
// Expected:
// - Each entity gets a separate subscription (not merged)
// - Add-on attaches to correct entity's subscription
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout-adv 4: separate subs due to force checkout")}`, async () => {
	const customerId = "legacy-checkout-adv-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const addOnBillingUnits = 100;
	const creditsItem = items.prepaidMessages({
		price: 10,
		billingUnits: addOnBillingUnits,
		includedUsage: 0,
	});
	const addOn = products.base({
		id: "credits-addon",
		items: [creditsItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const { db, org, env } = ctx;
	const subIds: string[] = [];

	// Attach Pro to each entity with force_checkout (creates separate subs)
	for (const entity of entities) {
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entity.id,
			force_checkout: true,
		});

		expect(res.checkout_url).toBeDefined();
		await completeStripeCheckoutFormV2({ url: res.checkout_url });
	}

	// Verify separate subscriptions
	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).not.toBe(entity2SubId);
	subIds.push(entity1SubId!);
	subIds.push(entity2SubId!);

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity1SubId,
	});

	// Upgrade both entities to Premium
	for (const entity of entities) {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entity.id,
		});
	}

	// Verify subs still correct after upgrades
	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: subIds[0],
	});

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: subIds[1],
	});

	// Attach add-on to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[1].id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: addOnBillingUnits * 2,
			},
		],
	});

	// Verify add-on is on entity 2's subscription
	const fullCusAfterAddOn = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const addOnProd = fullCusAfterAddOn.customer_products.find(
		(cp) => cp.product.id === addOn.id,
	);

	expect(addOnProd).toBeDefined();
	const addOnSubId = addOnProd?.subscription_ids?.[0];
	expect(addOnSubId).toBe(subIds[1]); // Should be on entity 2's sub

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: subIds[1],
	});

	// Verify entities have correct products
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expectProductAttached({ customer: entity2, productId: addOn.id });
});
