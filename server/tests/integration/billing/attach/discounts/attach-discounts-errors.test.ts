/**
 * Integration tests for error handling when attaching with invalid discounts.
 *
 * Tests error cases:
 * - Invalid coupon ID (doesn't exist in Stripe)
 * - Invalid promotion code (doesn't exist or inactive)
 * - Expired coupon
 * - Mixed valid + invalid rewards (entire request fails)
 * - Preview with invalid reward also fails
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createPercentCoupon } from "../../utils/discounts/discountTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Invalid coupon ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Attach pro with a fake coupon ID that doesn't exist in Stripe
 *
 * Expected:
 * - ErrCode.InvalidRequest error
 */
test.concurrent(`${chalk.yellowBright("attach-discount-error 1: invalid coupon ID")}`, async () => {
	const customerId = "att-disc-err-bad-coupon";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				discounts: [{ reward_id: "fake_coupon_does_not_exist" }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Invalid promotion code
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Attach pro with a fake promo code string
 *
 * Expected:
 * - ErrCode.InvalidRequest error
 */
test.concurrent(`${chalk.yellowBright("attach-discount-error 2: invalid promotion code")}`, async () => {
	const customerId = "att-disc-err-bad-promo";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				discounts: [{ promotion_code: "NONEXISTENT_CODE_12345" }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Expired coupon
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create a coupon in Stripe, then immediately delete it (making it invalid)
 * - Attach pro with the deleted coupon
 *
 * Expected:
 * - ErrCode.InvalidRequest error
 *
 * Note: We delete the coupon rather than setting redeem_by in the past,
 * because Stripe doesn't allow creating coupons with redeem_by in the past.
 */
test.concurrent(`${chalk.yellowBright("attach-discount-error 3: deleted coupon")}`, async () => {
	const customerId = "att-disc-err-deleted";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 10 });

	// Delete the coupon to make it invalid
	await stripeCli.coupons.del(coupon.id);

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				discounts: [{ reward_id: coupon.id }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Mixed valid and invalid rewards (entire request fails)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create one valid coupon
 * - Attach pro with one valid and one fake coupon
 *
 * Expected:
 * - Entire request fails with ErrCode.InvalidRequest
 * - The valid coupon is not applied
 */
test.concurrent(`${chalk.yellowBright("attach-discount-error 4: mixed valid and invalid rewards")}`, async () => {
	const customerId = "att-disc-err-mixed";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const validCoupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				discounts: [
					{ reward_id: validCoupon.id },
					{ reward_id: "fake_coupon_xxx" },
				],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Preview with invalid reward also fails
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Preview attach pro with a fake coupon ID
 *
 * Expected:
 * - ErrCode.InvalidRequest error (preview validates discounts too)
 */
test.concurrent(`${chalk.yellowBright("attach-discount-error 5: preview with invalid reward fails")}`, async () => {
	const customerId = "att-disc-err-preview";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.previewAttach({
				customer_id: customerId,
				product_id: pro.id,
				discounts: [{ reward_id: "nonexistent_coupon_id" }],
			});
		},
	});
});
