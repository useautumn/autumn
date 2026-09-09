import { expect, test } from "bun:test";
import {
	ApiVersion,
	type ApiCustomerV5,
	type ApiPlanV1,
	type CheckResponseV3,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_3 });

test("threshold billing charges one feature-unit chunk", async () => {
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
		customerId: `threshold-billing-e2e-${Math.random().toString(36).slice(2, 8)}`,
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

	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		usage: 40,
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

	const invoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id as string,
	});
	expect(invoices.data.some((invoice) => invoice.total === 10_000)).toBe(true);
}, { timeout: 120_000 });

test("threshold billing does not charge below the threshold", async () => {
	const planId = `threshold_below_${Math.random().toString(36).slice(2, 9)}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Threshold billing below threshold",
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
		customerId: `threshold-billing-below-${Math.random().toString(36).slice(2, 8)}`,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	await autumnV2_3.billing.attach({ customer_id: customerId, plan_id: planId });
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 99,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		usage: 99,
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	const invoices = await pollUntil({
		fetch: () =>
			ctx.stripeCli.invoices.list({
				customer: customer.stripe_id as string,
			}),
		until: ({ data }) =>
			data.some(
				(invoice) =>
					invoice.metadata?.autumn_action_source === "threshold_billing",
			),
		timeoutMs: 30_000,
	});
	expect(
		invoices.data.some(
			(invoice) =>
				invoice.metadata?.autumn_action_source === "threshold_billing",
		),
	).toBe(false);
}, { timeout: 120_000 });

test("threshold billing charges at the exact threshold", async () => {
	const planId = `threshold_exact_${Math.random().toString(36).slice(2, 9)}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Threshold billing exact threshold",
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
		customerId: `threshold-billing-exact-${Math.random().toString(36).slice(2, 8)}`,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	await autumnV2_3.billing.attach({ customer_id: customerId, plan_id: planId });
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		usage: 0,
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	const invoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id as string,
	});
	expect(invoices.data.some((invoice) => invoice.total === 10_000)).toBe(true);
}, { timeout: 120_000 });

test("threshold billing blocks a failed payment", async () => {
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
	await expectRejectedTrack({ autumn: autumnV2_3, customerId });
}, { timeout: 120_000 });

test("threshold billing unblocks after the failed invoice is paid", async () => {
	const planId = `threshold_recovery_${Math.random().toString(36).slice(2, 9)}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Threshold billing recovery",
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
		customerId: `threshold-billing-recovery-${Math.random().toString(36).slice(2, 8)}`,
		setup: [s.customer({ paymentMethod: "fail" })],
		actions: [],
	});
	await autumnV2_3.billing.attach({ customer_id: customerId, plan_id: planId });
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await expectCustomerProductCorrect({
		customerId,
		autumn: autumnV2_3,
		productId: planId,
		state: "past_due",
	});
	expect(
		await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
	).toMatchObject({ allowed: false });

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: customer.stripe_id!,
		type: "success",
	});
	const openInvoice = (
		await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id!,
			status: "open",
			limit: 1,
		})
	).data[0];
	expect(openInvoice).toBeDefined();
	expect(openInvoice!.status).toBe("open");
	const paidInvoice = await ctx.stripeCli.invoices.pay(openInvoice!.id);
	expect(paidInvoice.status).toBe("paid");

	await expectCustomerProductCorrect({
		customerId,
		autumn: autumnV2_3,
		productId: planId,
		state: "active",
	});
	expect(
		await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
	).toMatchObject({ allowed: true });
	await expect(
		autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		}),
	).resolves.toBeDefined();
}, { timeout: 120_000 });

const expectRejectedTrack = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
}) => {
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			});
		} catch (error) {
			if ((error as { code?: string }).code === "insufficient_balance") return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
	expect(true).toBe(false);
};
