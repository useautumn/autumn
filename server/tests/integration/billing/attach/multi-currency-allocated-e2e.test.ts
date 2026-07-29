import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// An allocated (arrear-prorated, bill-immediately) overage seat must be billed
// at the eur per-seat price, exercising computeAllocatedInvoiceLineItems'
// currency resolution.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur allocated overage bills the eur per-seat price")}`,
	async () => {
		const planId = `mc_alloc_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Allocated Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
			items: [
				{
					feature_id: TestFeature.Users,
					included: 0,
					price: {
						amount: 50,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 1,
						additional_currencies: [{ currency: "eur", amount: 45 }],
					},
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-alloc-eur",
			setup: [
				s.customer({
					testClock: true,
					paymentMethod: "success",
					data: { currency: "eur" },
				}),
			],
			actions: [],
		});

		// Attach with 2 prepaid seats; the seat charge is prorated + billed in eur.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [{ feature_id: TestFeature.Users, quantity: 2 }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// The allocated/prorated seat invoice must be denominated in eur.
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		expect(stripeInvoices.data.length).toBeGreaterThanOrEqual(1);
		for (const invoice of stripeInvoices.data) {
			expect(invoice.currency).toBe("eur");
		}
		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		for (const sub of subs.data) {
			expect(sub.currency).toBe("eur");
			for (const item of sub.items.data) {
				expect(item.price.currency).toBe("eur");
			}
		}
	},
);
