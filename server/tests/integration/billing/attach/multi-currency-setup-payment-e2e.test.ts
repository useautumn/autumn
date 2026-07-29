import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// A setup-payment checkout session for an eur-locked customer must be created in
// eur (createSetupCheckoutSession resolves the customer currency).
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur setup-payment session is created in eur")}`,
	async () => {
		const planId = `mc_setup_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Setup Payment Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-setup-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		const res = await autumnV1.billing.setupPayment({
			customer_id: customerId,
			plan_id: planId,
		});
		expect(res.url).toContain("checkout.stripe.com");

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const sessions = await ctx.stripeCli.checkout.sessions.list({
			customer: customer.stripe_id as string,
		});
		const setupSession = sessions.data.find((s) => s.mode === "setup");
		expect(setupSession).toBeDefined();
		expect(setupSession?.currency).toBe("eur");
	},
);
