import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateReward,
	LegacyVersion,
	RewardType,
} from "@autumn/shared";
import { expectAttachCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { createReward } from "@tests/utils/productUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "coupon3";

const pro = products.pro({
	id: "pro",
	items: [items.consumableWords()],
});

const oneOff = products.oneOff({
	id: "one-off",
	items: [items.monthlyWords({ includedUsage: 500 })],
});

// Reward: FixedDiscount $5, OneOff duration
const rewardId = "attachcoupon";
const promoCode = "attachcouponcode";
const reward: CreateReward = {
	id: rewardId,
	name: "attachcoupon",
	promo_codes: [{ code: promoCode }],
	type: RewardType.FixedDiscount,
	discount_config: {
		discount_value: 5,
		duration_type: CouponDurationType.OneOff,
		duration_value: 1,
		should_rollover: true,
		apply_to_all: true,
		price_ids: [],
	},
};

test(chalk.yellow(`${testCase} - Testing attach coupon`), async () => {
	const customerId = testCase;

	// Init scenario: products + customer with PM
	const { ctx: testCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, oneOff] }),
		],
		actions: [],
	});

	// Create autumn client with LegacyVersion.v1_4 (matches original test)
	const autumn = new AutumnInt({
		version: LegacyVersion.v1_4,
		secretKey: testCtx.orgSecretKey,
	});

	// Create reward manually (s.reward calls createReward internally but we need to
	// match the exact original behavior with the test-case-prefixed product ID)
	await createReward({
		orgId: testCtx.org.id,
		env: testCtx.env,
		db: testCtx.db,
		autumn,
		reward,
		productId: pro.id,
	});

	const couponAmount = reward.discount_config!.discount_value;

	// Attach pro with reward ID
	await autumn.attach({
		customer_id: customerId,
		product_id: pro.id,
		reward: rewardId,
	});

	const customer = await autumn.customers.get(customerId);
	expectAttachCorrect({
		customer,
		product: pro,
	});

	const invoice = customer.invoices![0];
	const basePrice = getBasePrice({ product: pro });
	expect(invoice.total).toBe(basePrice - couponAmount);

	// Attach one-off with reward ID
	await autumn.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		reward: rewardId,
	});

	const customerAfterOneOff = await autumn.customers.get(customerId);
	expectProductAttached({
		customer: customerAfterOneOff,
		product: oneOff,
	});

	const oneOffInvoice = customerAfterOneOff.invoices![0];
	const oneOffBasePrice = getBasePrice({ product: oneOff });
	expect(oneOffInvoice.total).toBe(oneOffBasePrice - couponAmount);
	expect(oneOffInvoice.product_ids).toContain(oneOff.id);

	// Attach one-off again with promo code
	await autumn.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		reward: promoCode,
	});

	const customerAfterPromo = await autumn.customers.get(customerId);
	expectProductAttached({
		customer: customerAfterPromo,
		product: oneOff,
		quantity: 2,
	});

	expect(customerAfterPromo.invoices!.length).toBe(3);
	const promoBasePrice = getBasePrice({ product: oneOff });
	for (let i = 0; i < 2; i++) {
		const inv = customerAfterPromo.invoices![i];
		expect(inv.total).toBe(promoBasePrice - couponAmount);
		expect(inv.product_ids).toContain(oneOff.id);
	}
});
