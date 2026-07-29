import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	ErrCode,
	TierBehavior,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

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
	`${chalk.yellowBright("multi-currency e2e: eur usage plan bills prepaid and consumable in eur")}`,
	async () => {
		const planId = `mc_usage_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Usage Plan",
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
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
						additional_currencies: [{ currency: "eur", amount: 9 }],
					},
				},
				{
					feature_id: TestFeature.Words,
					included: 0,
					price: {
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						tier_behavior: TierBehavior.Graduated,
						tiers: [
							{
								to: 1000,
								amount: 0.5,
								additional_currencies: [{ currency: "eur", amount: 0.4 }],
							},
							{
								to: "inf",
								amount: 0.3,
								additional_currencies: [{ currency: "eur", amount: 0.25 }],
							},
						],
					},
				},
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-usage-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 36 });

		const sub = await getOnlySubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(sub.currency).toBe("eur");
		expect(sub.items.data.length).toBeGreaterThanOrEqual(3);
		for (const item of sub.items.data) {
			expect(item.price.currency).toBe("eur");
		}

		const fixedItem = sub.items.data.find(
			(item) => item.price.unit_amount === 1800,
		);
		expect(fixedItem).toBeDefined();

		const prepaidItem = sub.items.data.find(
			(item) => item.price.unit_amount === 900 && item.quantity === 2,
		);
		expect(prepaidItem).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur upgrade credits in eur and locked switch is blocked")}`,
	async () => {
		const suffix = getSuffix();
		const makePlan = async ({
			planId,
			usd,
			eur,
		}: {
			planId: string;
			usd: number;
			eur: number;
		}) => {
			await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
				plan_id: planId,
				name: planId,
				auto_enable: false,
				price: {
					amount: usd,
					interval: BillingInterval.Month,
					additional_currencies: [{ currency: "eur", amount: eur }],
				},
			});
		};
		const basicId = `mc_up_basic_${suffix}`;
		const premiumId = `mc_up_premium_${suffix}`;
		await makePlan({ planId: basicId, usd: 20, eur: 18 });
		await makePlan({ planId: premiumId, usd: 50, eur: 45 });

		const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
			customerId: "mc-up-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: basicId,
			redirect_mode: "if_required",
		});

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			func: () =>
				autumnV2.billing.attach({
					customer_id: customerId,
					plan_id: premiumId,
					currency: "usd",
					redirect_mode: "if_required",
				}),
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premiumId,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: premiumId });
		expectCustomerInvoiceCorrect({ customer, count: 2, latestTotal: 27 });

		const sub = await getOnlySubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(sub.currency).toBe("eur");
		expect(sub.items.data).toHaveLength(1);
		expect(sub.items.data[0].price.unit_amount).toBe(4500);
	},
);
