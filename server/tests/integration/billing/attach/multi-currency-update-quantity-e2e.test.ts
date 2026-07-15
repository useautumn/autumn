import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// A prepaid quantity increase must prorate at the customer's locked currency
// (eur), not the usd base amount — this exercises computeUpdateQuantityLineItems'
// currency resolution end to end.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur prepaid quantity increase prorates in eur")}`,
	async () => {
		const billingUnits = 12;
		const usdPerPack = 8;
		const eurPerPack = 7;
		const planId = `mc_upqty_${getSuffix()}`;

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Update Qty Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: usdPerPack,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: billingUnits,
						additional_currencies: [{ currency: "eur", amount: eurPerPack }],
					},
				},
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-upqty-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// +10 packs at the eur pack price (7), NOT the usd price (8).
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: planId,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});
		expect(preview.total).toBe(10 * eurPerPack);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: planId,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(
			20 * billingUnits,
		);

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("eur");
		expect(latestInvoice.total).toBe(10 * eurPerPack * 100);
	},
);
