/** A past_due subscription is already in dunning, so a set_plans change applies at once like Stripe:
 * usage resets at the change and is billed on its invoice exactly once, never again at the next renewal. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	BillingMethod,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const OVERAGE_AT_OLD_PRICE = 5;

test.concurrent(
	`${chalk.yellowBright("set-plans past due: a usage price change resets usage now and bills it once, not again at renewal")}`,
	async () => {
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, testClockId } =
			await initScenario({
				customerId: "set-plans-past-due-usage-reset",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});
		const stripeCli = ctx.stripeCli;
		const stripeCustomerId = (
			await CusService.getFull({ ctx, idOrInternalId: customerId })
		).processor!.id;

		const failingCard = await stripeCli.paymentMethods.attach(
			"pm_card_chargeCustomerFail",
			{ customer: stripeCustomerId },
		);
		await stripeCli.customers.update(stripeCustomerId, {
			invoice_settings: { default_payment_method: failingCard.id },
		});
		const renewedAtMs = await advanceToNextInvoice({
			stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});
		const [subscription] = (
			await stripeCli.subscriptions.list({ customer: stripeCustomerId })
		).data;
		expect(subscription?.status).toBe("past_due");

		await autumnV1.track(
			{ customer_id: customerId, feature_id: TestFeature.Messages, value: 150 },
			{ timeout: 2000 },
		);

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pro.id,
							customize: {
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 100,
										price: {
											amount: 0.15,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
											billing_units: 1,
										},
									},
								],
							},
						},
					],
				},
			],
		};
		await autumnV2_4.billing.setPlans(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Messages]?.usage).toBe(0);

		// The customer fixes their card, so the next renewal is billed normally rather than left to dunning.
		const workingCard = await stripeCli.paymentMethods.attach("pm_card_visa", {
			customer: stripeCustomerId,
		});
		await stripeCli.customers.update(stripeCustomerId, {
			invoice_settings: { default_payment_method: workingCard.id },
		});
		await advanceToNextInvoice({
			stripeCli,
			testClockId: testClockId!,
			currentEpochMs: renewedAtMs,
			withPause: true,
		});

		const { data: invoices } = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 100,
		});
		const billedInvoices = invoices.filter(
			(invoice) => invoice.status !== "void",
		);
		expect(
			billedInvoices.filter(
				(invoice) => invoice.billing_reason === "subscription_cycle",
			),
		).toHaveLength(2);
		const messagesAmounts = billedInvoices
			.flatMap((invoice) => invoice.lines.data)
			.filter((line) => /messages/i.test(line.description ?? ""))
			.map((line) => line.amount / 100)
			.filter((amount) => amount !== 0);
		expect(messagesAmounts).toEqual([OVERAGE_AT_OLD_PRICE]);
	},
);
