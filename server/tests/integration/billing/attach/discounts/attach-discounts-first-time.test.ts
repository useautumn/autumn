/**
 * Integration tests for promotion codes restricted to first-time transactions.
 *
 * Tests:
 * - First-time customer can redeem a restricted promo code
 * - Customer with a prior paid purchase is blocked with PromoCodeFirstTimeOnly
 */

import { test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createPercentCoupon,
	createPromotionCode,
} from "../../utils/discounts/discountTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: First-time customer can redeem a first-time-only promo code
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product (no prior payments)
 * - Create 25% coupon + promotion code with first_time_transaction restriction
 * - Attach pro ($20/mo) with the promo code
 *
 * Expected:
 * - Pro active, invoice = $20 * 0.75 = $15
 */
test.concurrent(
	`${chalk.yellowBright("attach-discount-first-time 1: first-time customer can redeem")}`,
	async () => {
		const customerId = "att-disc-ft-fresh";

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
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });
		const promoCode = await createPromotionCode({
			stripeCli,
			coupon,
			code: `FTFRESH-${customerId}`,
			firstTimeTransaction: true,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ promotion_code: promoCode.code }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 15,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Customer with prior purchase is blocked
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches pro ($20/mo) — now has a paid invoice
 * - Create 25% coupon + promotion code with first_time_transaction restriction
 * - Attach premium ($50/mo) with the promo code
 *
 * Expected:
 * - PromoCodeFirstTimeOnly error, premium not attached
 */
test.concurrent(
	`${chalk.yellowBright("attach-discount-first-time 2: prior purchase blocked")}`,
	async () => {
		const customerId = "att-disc-ft-blocked";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });
		const promoCode = await createPromotionCode({
			stripeCli,
			coupon,
			code: `FTBLOCK-${customerId}`,
			firstTimeTransaction: true,
		});

		await expectAutumnError({
			errCode: ErrCode.PromoCodeFirstTimeOnly,
			func: async () => {
				await autumnV1.billing.attach({
					customer_id: customerId,
					product_id: premium.id,
					discounts: [{ promotion_code: promoCode.code }],
				});
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [premium.id],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Re-sending a code already on the subscription is deduped, not blocked
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - First-time customer attaches pro with a first-time-only promo code (forever
 *   duration) — succeeds, customer now has a paid invoice
 * - Upgrade to premium re-sending the same promotion code
 *
 * Expected:
 * - No PromoCodeFirstTimeOnly error — the code's coupon is already applied to
 *   the subscription, so it is deduplicated instead of re-validated
 */
test.concurrent(
	`${chalk.yellowBright("attach-discount-first-time 3: re-sent applied code is deduped")}`,
	async () => {
		const customerId = "att-disc-ft-resend";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });
		const promoCode = await createPromotionCode({
			stripeCli,
			coupon,
			code: `FTRESEND-${customerId}`,
			firstTimeTransaction: true,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ promotion_code: promoCode.code }],
		});

		await timeout(5000);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			discounts: [{ promotion_code: promoCode.code }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
	},
);
