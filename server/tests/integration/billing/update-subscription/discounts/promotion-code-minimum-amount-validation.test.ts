/**
 * TDD test for validating Stripe promotion-code minimum spend before a
 * subscription update executes Stripe writes.
 *
 * Red-failure mode:
 *  - update charges and stores a rollback invoice before Stripe rejects the promo.
 *
 * Green-success criteria:
 *  - update rejects up front and leaves the customer's invoice list unchanged.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

test.concurrent(
	chalk.yellowBright(
		"update-subscription discounts: rejects unmet promotion-code minimum before invoicing",
	),
	async () => {
		const customerId = "update-promo-min-spend";
		const billingUnits = 12;
		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 8,
				}),
			],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		const initialCustomer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const initialInvoices = await InvoiceService.list({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
		});

		const coupon = await ctx.stripeCli.coupons.create({
			percent_off: 50,
			duration: "repeating",
			duration_in_months: 12,
		});
		const promotionCode = await ctx.stripeCli.promotionCodes.create({
			promotion: { type: "coupon", coupon: coupon.id },
			code: `MINAMT${Date.now()}`,
			restrictions: {
				minimum_amount: 100,
				minimum_amount_currency: "usd",
			},
		});

		await expect(
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: product.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
				],
				discounts: [{ promotion_code: promotionCode.code }],
			}),
		).rejects.toThrow(/promotion code.*minimum/i);

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 1,
		});
		const invoicesAfter = await InvoiceService.list({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
		});
		expect(invoicesAfter).toHaveLength(initialInvoices.length);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
