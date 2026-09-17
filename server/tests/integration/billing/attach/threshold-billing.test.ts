import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CheckResponseV3,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_3 });

const createThresholdPlan = async ({
	prefix,
	threshold,
}: {
	prefix: string;
	threshold: number;
}) => {
	const planId = `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: `Threshold billing ${prefix}`,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 0,
				price: {
					amount: 1,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
				},
				threshold_billing: { threshold },
			},
		],
	});
	return planId;
};

test(
	"threshold billing charges one feature-unit chunk",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold",
			threshold: 100,
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
		expect(invoices.data.some((invoice) => invoice.total === 10_000)).toBe(
			true,
		);
	},
	{ timeout: 120_000 },
);

test(
	"threshold billing does not charge below the threshold",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold_below",
			threshold: 100,
		});
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: `threshold-billing-below-${Math.random().toString(36).slice(2, 8)}`,
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
	},
	{ timeout: 120_000 },
);

test(
	"threshold billing charges at the exact threshold",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold_exact",
			threshold: 100,
		});
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: `threshold-billing-exact-${Math.random().toString(36).slice(2, 8)}`,
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
		expect(invoices.data.some((invoice) => invoice.total === 10_000)).toBe(
			true,
		);
	},
	{ timeout: 120_000 },
);

test(
	"threshold billing blocks a failed payment",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold_fail",
			threshold: 100,
		});
		const { customerId, autumnV2_3 } = await initScenario({
			customerId: `threshold-billing-failed-${Math.random().toString(36).slice(2, 8)}`,
			setup: [s.customer({ paymentMethod: "fail" })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await expectRejectedTrack({ autumn: autumnV2_3, customerId });
	},
	{ timeout: 120_000 },
);

test(
	"threshold billing unblocks after the failed invoice is paid",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold_recovery",
			threshold: 100,
		});
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: `threshold-billing-recovery-${Math.random().toString(36).slice(2, 8)}`,
			setup: [s.customer({ paymentMethod: "fail" })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});
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
	},
	{ timeout: 120_000 },
);

/**
 * A threshold charge settles debt the customer already incurred, so losing the
 * payment method must not discard it the way a missed auto top-up grant does.
 *
 * Red (current):  setup bails on the missing card before it knows this is a
 *                 threshold charge, so no invoice is raised, the plan stays
 *                 active, and usage keeps accruing on an uncollectable balance.
 * Green (after):  the overage lands on an open invoice, the plan goes past_due
 *                 and check returns allowed: false.
 */
test(
	"threshold billing invoices the overage when the payment method is gone",
	async () => {
		const planId = await createThresholdPlan({
			prefix: "threshold_no_pm",
			threshold: 100,
		});
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: `threshold-billing-no-pm-${Math.random().toString(36).slice(2, 8)}`,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await removeAllPaymentMethods({
			stripeClient: ctx.stripeCli,
			stripeCustomerId: customer.stripe_id!,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		// The metadata lands when Stripe creates the draft, before lines are added
		// and before it is finalized, so poll on the settled status instead.
		const findThresholdInvoice = (invoices: { data: Stripe.Invoice[] }) =>
			invoices.data.find(
				(invoice) =>
					invoice.metadata?.autumn_action_source === "threshold_billing",
			);

		const invoices = await pollUntil({
			fetch: () =>
				ctx.stripeCli.invoices.list({ customer: customer.stripe_id! }),
			until: (result) => findThresholdInvoice(result)?.status === "open",
			timeoutMs: 60_000,
		});
		const thresholdInvoice = findThresholdInvoice(invoices);
		expect(thresholdInvoice).toBeDefined();
		expect(thresholdInvoice!.status).toBe("open");
		expect(thresholdInvoice!.total).toBe(10_000);

		// Paying this invoice must unblock only the plan it settles, so it has to
		// name that plan — a customer can hold several threshold plans at once.
		expect(
			thresholdInvoice!.metadata?.autumn_settled_customer_product_id,
		).toBeTruthy();

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

		// Settling the invoice must lift the block through check's own cached
		// subject — a Postgres-only recovery leaves the customer blocked.
		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: customer.stripe_id!,
			type: "success",
		});
		await ctx.stripeCli.invoices.pay(thresholdInvoice!.id);

		const recovered = await pollUntil({
			fetch: () =>
				autumnV2_3.check<CheckResponseV3>({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				}),
			until: (result) => result.allowed === true,
			timeoutMs: 60_000,
		});
		expect(recovered).toMatchObject({ allowed: true });
	},
	{ timeout: 240_000 },
);

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
