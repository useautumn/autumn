import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const makePlan = ({
	planId,
	usd,
	eur,
}: {
	planId: string;
	usd: number;
	eur: number;
}) =>
	autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: planId,
		auto_enable: false,
		price: {
			amount: usd,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "eur", amount: eur }],
		},
	});

// A scheduled downgrade must keep the customer + subscription in eur.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur scheduled downgrade stays in eur")}`,
	async () => {
		const suffix = getSuffix();
		const premiumId = `mc_dn_premium_${suffix}`;
		const basicId = `mc_dn_basic_${suffix}`;
		await makePlan({ planId: premiumId, usd: 50, eur: 45 });
		await makePlan({ planId: basicId, usd: 20, eur: 18 });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-dn-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premiumId,
			redirect_mode: "if_required",
		});

		// Downgrade to the cheaper plan → scheduled switch at cycle end.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: basicId,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premiumId });
		await expectProductScheduled({ customer, productId: basicId });

		// The active subscription remains eur through the scheduled downgrade.
		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		for (const sub of subs.data) {
			expect(sub.currency).toBe("eur");
		}
	},
);
