/**
 * Red (before):  set_plans changing a send_invoice subscription without invoice_mode charged the card now; with no card
 *                the plan was left pending behind a payment URL and expired after 10 minutes.
 * Green (after): the change is invoiced on the subscription's net terms and payment methods, and applies now.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	type InvoicePaymentMethod,
} from "@autumn/shared";
import { expectInvoiceSentOnTerms } from "@tests/integration/billing/utils/expectInvoiceSentOnTerms";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const NET_TERMS_DAYS = 14;
const PAYMENT_METHOD_TYPES: InvoicePaymentMethod[] = [
	"card",
	"us_bank_account",
];

test.concurrent(
	`${chalk.yellowBright("set-plans inherits send_invoice: no card, a reset-now price change is invoiced on the subscription's terms and applies now")}`,
	async () => {
		const customerId = "set-plans-inherit-send-invoice";
		const dedicated = products.base({
			id: "dedicated",
			items: [
				items.monthlyPrice({ price: 1000 }),
				items.prepaid({
					featureId: TestFeature.Messages,
					price: 1500,
					billingUnits: 1,
				}),
			],
		});
		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [dedicated] })],
			actions: [],
		});
		await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: dedicated.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 3 }],
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: true,
				net_terms_days: NET_TERMS_DAYS,
				payment_method_types: PAYMENT_METHOD_TYPES,
			},
		});

		const result = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					billing_cycle_anchor: "phase_start",
					plans: [
						{
							plan_id: dedicated.id,
							customize: {
								price: { amount: 8000, interval: BillingInterval.Month },
							},
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: 3 },
							],
						},
					],
				},
			],
		});

		expect(result.required_action).toBeUndefined();
		expectInvoiceSentOnTerms({
			stripeInvoice: await ctx.stripeCli.invoices.retrieve(
				result.invoice!.stripe_id,
			),
			netTermsDays: NET_TERMS_DAYS,
			paymentMethodTypes: PAYMENT_METHOD_TYPES,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const liveDedicated = fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProduct.product.id === dedicated.id &&
				customerProduct.status !== CusProductStatus.Expired,
		);
		expect(liveDedicated.map(({ status }) => status)).toEqual([
			CusProductStatus.Active,
		]);
	},
);
