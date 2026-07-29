import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const makePlan = ({
	planId,
	usd,
	eur,
	group,
}: {
	planId: string;
	usd: number;
	eur: number;
	group: string;
}) =>
	autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: planId,
		auto_enable: false,
		group,
		price: {
			amount: usd,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "eur", amount: eur }],
		},
	});

// Multi-attach of two eur-priced plans must total and bill in the customer's
// locked currency (eur), not the usd amounts.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur multi-attach totals in eur and bills eur")}`,
	async () => {
		const suffix = getSuffix();
		const mainId = `mc_ma_main_${suffix}`;
		const addonId = `mc_ma_second_${suffix}`;
		await makePlan({
			planId: mainId,
			usd: 20,
			eur: 18,
			group: `g_a_${suffix}`,
		});
		await makePlan({
			planId: addonId,
			usd: 30,
			eur: 27,
			group: `g_b_${suffix}`,
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		const multiAttachParams = {
			customer_id: customerId,
			plans: [{ plan_id: mainId }, { plan_id: addonId }],
		};

		// eur sum (18 + 27), NOT the usd sum (50).
		const preview =
			await autumnV1.billing.previewMultiAttach(multiAttachParams);
		expect(preview.total).toBe(45);

		await autumnV1.billing.multiAttach(multiAttachParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [mainId, addonId] });

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data.length).toBeGreaterThanOrEqual(1);
		for (const sub of subs.data as Stripe.Subscription[]) {
			expect(sub.currency).toBe("eur");
		}
	},
);
