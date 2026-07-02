import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const createMcPlan = async () => {
	const planId = `mc_e2e_${getSuffix()}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "MC E2E Plan",
		auto_enable: false,
		price: {
			amount: 20,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "eur", amount: 18 }],
		},
	});
	return planId;
};

const getOnlySubscription = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) => {
	const subs = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subs.data).toHaveLength(1);
	return subs.data[0];
};

test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur customer attaches, pays the eur amount")}`,
	async () => {
		const planId = await createMcPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-e2e-eur",
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

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 18 });

		const sub = await getOnlySubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(sub.currency).toBe("eur");
		const item = sub.items.data[0];
		expect(item.price.currency).toBe("eur");
		expect(item.price.unit_amount).toBe(1800);
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: usd customer on the same plan is unaffected")}`,
	async () => {
		const planId = await createMcPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-e2e-usd",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });

		const sub = await getOnlySubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(sub.currency).toBe("usd");
		expect(sub.items.data[0].price.unit_amount).toBe(2000);
	},
);
