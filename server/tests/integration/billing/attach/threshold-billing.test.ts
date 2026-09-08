import { expect, test } from "bun:test";
import {
	ApiVersion,
	type ApiCustomerV5,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_3 });

test.concurrent(
	"threshold billing charges one feature-unit chunk",
	async () => {
		const planId = `threshold_${Math.random().toString(36).slice(2, 9)}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Threshold billing",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: 1,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
					threshold_billing: { threshold: 100 },
				},
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "threshold-billing-e2e",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 140,
		});

		await new Promise((resolve) => setTimeout(resolve, 12_000));
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			usage: 40,
		});

		const invoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		expect(invoices.data.some((invoice) => invoice.total === 10_000)).toBe(
			true,
		);
	},
);

test.concurrent("threshold billing blocks a failed payment", async () => {
	const planId = `threshold_fail_${Math.random().toString(36).slice(2, 9)}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Threshold billing failure",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 0,
				price: {
					amount: 1,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
				},
				threshold_billing: { threshold: 100 },
			},
		],
	});
	const { customerId, autumnV2_3 } = await initScenario({
		customerId: `threshold-billing-failed-${Math.random().toString(36).slice(2, 8)}`,
		setup: [s.customer({ paymentMethod: "fail" })],
		actions: [],
	});
	await autumnV2_3.billing.attach({ customer_id: customerId, plan_id: planId });
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await new Promise((resolve) => setTimeout(resolve, 12_000));
	await expect(
		autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		}),
	).rejects.toThrow();
});
