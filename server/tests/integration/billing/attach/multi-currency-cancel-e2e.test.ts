import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectProductCanceling } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// Cancelling an eur subscription must keep the customer and subscription in eur.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur subscription cancel stays in eur")}`,
	async () => {
		const planId = `mc_cancel_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Cancel Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-cancel-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: planId,
			cancel_action: "cancel_end_of_cycle",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: planId });

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		for (const sub of subs.data) {
			expect(sub.currency).toBe("eur");
		}
	},
);
