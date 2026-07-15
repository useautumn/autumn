import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// A manual top-up (subscriptions.update with feature_quantities on a one-off
// prepaid item) must emit a standalone invoice at the eur pack price, exercising
// computeManualTopUpPlan's currency resolution.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur manual top-up bills the eur pack price")}`,
	async () => {
		const planId = `mc_mtopup_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Manual Topup Plan",
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
						amount: 10,
						interval: BillingInterval.OneOff,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
						additional_currencies: [{ currency: "eur", amount: 9 }],
					},
				},
			],
		});

		const { customerId, autumnV1, autumnV2_1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "mc-mtopup-eur",
				setup: [
					s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
				],
				actions: [],
			});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: before,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		// Manual top-up: add one more pack (delta semantics).
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		// Standalone top-up invoice priced in eur (9), not usd (10).
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("eur");
		expect(latestInvoice.total).toBe(9 * 100);
	},
);
