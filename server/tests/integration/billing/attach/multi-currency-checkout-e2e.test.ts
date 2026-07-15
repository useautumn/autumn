import { expect, test } from "bun:test";
import {
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

// A hosted Stripe Checkout session (triggered by attaching a paid recurring plan
// with no payment method) must be created in the customer's eur currency —
// exercising buildStripeCheckoutSessionItems' currency resolution.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur hosted checkout session is created in eur")}`,
	async () => {
		const planId = `mc_checkout_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Checkout Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
		});

		// No payment method → attach returns a hosted Stripe Checkout url.
		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-checkout-eur",
			setup: [s.customer({ data: { currency: "eur" } })],
			actions: [],
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
		});
		expect(result.payment_url).toBeDefined();
		expect(result.payment_url).toContain("checkout.stripe.com");

		const sessionId = result.payment_url?.match(
			/cs_(?:test|live)_[A-Za-z0-9]+/,
		)?.[0] as string;
		expect(sessionId).toBeDefined();

		const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId, {
			expand: ["line_items"],
		});
		expect(session.currency).toBe("eur");
		for (const line of session.line_items?.data ?? []) {
			expect(line.currency).toBe("eur");
		}
	},
);
