import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type CustomerBillingControls,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);
const AUTO_TOPUP_WAIT_MS = 20000;

// An auto top-up (computeAutoTopupPlan, processed async via SQS) must charge the
// eur pack price for an eur-locked customer.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur auto top-up bills the eur pack price")}`,
	async () => {
		const planId = `mc_atopup_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Auto Topup Addon",
			auto_enable: false,
			add_on: true,
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

		const { customerId, autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId: "mc-atopup-eur",
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

		const controls: CustomerBillingControls = {
			auto_topups: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					threshold: 20,
					quantity: 100,
				},
			],
		};
		await autumnV2_1.customers.update(customerId, {
			billing_controls: controls,
		});

		// Drop below threshold → auto top-up fires via SQS.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 115,
		});

		// The auto top-up charge must be in eur at the eur pack price (9), not usd (10).
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("eur");
		expect(latestInvoice.total).toBe(9 * 100);
	},
);
