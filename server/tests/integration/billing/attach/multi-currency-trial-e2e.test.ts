import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
	FreeTrialDuration,
} from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// After a free trial converts, the first real charge must be the eur amount.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur trial converts and first charge is eur")}`,
	async () => {
		const planId = `mc_trial_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Trial Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
			free_trial: {
				duration_length: 7,
				duration_type: FreeTrialDuration.Day,
				card_required: true,
			},
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "mc-trial-eur",
				setup: [
					s.customer({
						testClock: true,
						paymentMethod: "success",
						data: { currency: "eur" },
					}),
				],
				actions: [],
			});

		// Plan created via RPC (unprefixed id) → attach in the body, not via
		// s.billing.attach (which prefixes the product id with the customer id).
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
		});

		// Advance past the 7-day trial to trigger the first real invoice.
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			startingFrom: new Date(advancedTo),
			numberOfDays: 10,
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });

		// The post-trial conversion charge is the eur amount (18), not usd (20).
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const paidCharge = stripeInvoices.data.find(
			(invoice) => invoice.total === 1800,
		);
		expect(paidCharge).toBeDefined();
		expect(paidCharge?.currency).toBe("eur");
	},
);
