import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	CusProductStatus,
	ErrCode,
	ms,
	stripeToAtmnAmount,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	calculateProratedDiff,
	calculateResetBillingCycleNowTotal,
} from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const loadPending = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	internalCustomerId: string;
}) => {
	const pending = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Pending],
	});
	expect(pending).toHaveLength(1);
	return pending[0];
};

const enablePending = ({
	customerId,
	pendingId,
	planId,
}: {
	customerId: string;
	pendingId: string;
	planId: string;
}): UpdateSubscriptionV1ParamsInput => ({
	customer_id: customerId,
	customer_product_id: pendingId,
	plan_id: planId,
	invoice_mode: { enabled: true, enable_plan_immediately: true },
});

test.concurrent(
	`${chalk.yellowBright("enable pending plan: replaces its invoice with an open invoice")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "enable-pending-invoice",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: true, issue_method: "send" },
		});

		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending.metadata_id!,
		});
		const oldInvoiceId = metadata!.stripe_invoice_id!;
		const oldInvoice = await ctx.stripeCli.invoices.retrieve(oldInvoiceId);
		const params = enablePending({
			customerId,
			pendingId: pending.id,
			planId: pro.id,
		});
		const preview = await autumnV2_2.subscriptions.previewUpdate(params);
		expect(preview.total).toBe(
			stripeToAtmnAmount({
				amount: oldInvoice.total,
				currency: oldInvoice.currency,
			}),
		);

		const result = await autumnV2_2.subscriptions.update(params);
		expect(result.invoice?.status).toBe("open");
		expect(result.invoice?.total).toBe(preview.total);
		expect(result.invoice?.stripe_id).not.toBe(oldInvoiceId);
		const replacedInvoice = await ctx.stripeCli.invoices.retrieve(oldInvoiceId);
		expect(replacedInvoice.status).toBe("void");
		const active = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(active).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: expires checkout and creates an open invoice")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "enable-pending-checkout",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const first = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});
		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending.metadata_id!,
		});
		const sessionId = metadata!.stripe_checkout_session_id!;
		const params = enablePending({
			customerId,
			pendingId: pending.id,
			planId: pro.id,
		});
		const result = await autumnV2_2.subscriptions.update(params);
		expect(first.payment_url).toBeTruthy();
		expect(
			(await ctx.stripeCli.checkout.sessions.retrieve(sessionId)).status,
		).toBe("expired");
		expect(result.invoice?.status).toBe("open");
		const active = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(active).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: ends the replaced live plan")}`,
	async () => {
		const pendingPlan = products.base({
			id: "pending",
			items: [
				items.monthlyPrice({ price: 1000 }),
				items.prepaid({
					featureId: TestFeature.Messages,
					price: 100,
					billingUnits: 1,
				}),
			],
		});
		const { autumnV2_2, autumnV2_4, ctx, customer, customerId } =
			await initScenario({
				customerId: "enable-pending-replacement",
				setup: [
					s.customer({ testClock: false }),
					s.products({ list: [pendingPlan] }),
				],
				actions: [],
			});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pendingPlan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 3 }],
			invoice_mode: { enabled: true, enable_plan_immediately: true },
		});
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pendingPlan.id,
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: 5 },
							],
							customize: {
								price: {
									amount: 8000,
									interval: BillingInterval.Month,
								},
							},
						},
					],
				},
			],
			invoice_mode: { enabled: true },
		});
		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		await autumnV2_2.subscriptions.update(
			enablePending({
				customerId,
				pendingId: pending.id,
				planId: pendingPlan.id,
			}),
		);
		const rows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]!.product.id).toBe(pendingPlan.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("enable custom pending plan: activates it over a paid same-group predecessor")}`,
	async () => {
		const live = products.pro({
			id: "custom-live",
			group: "shared",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pendingPlan = products.pro({
			id: "custom-pending",
			group: "shared",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "enable-custom-pending-replacement",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [live, pendingPlan] }),
			],
			actions: [],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: live.id,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pendingPlan.id,
			customize: {
				price: {
					amount: 5000,
					interval: BillingInterval.Month,
				},
			},
			invoice_mode: { enabled: true, issue_method: "draft" },
		});

		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending.metadata_id!,
		});
		const oldInvoiceId = metadata!.stripe_invoice_id!;
		const result = await autumnV2_2.subscriptions.update(
			enablePending({
				customerId,
				pendingId: pending.id,
				planId: pendingPlan.id,
			}),
		);

		expect(result.invoice?.status).toBe("open");
		const oldInvoice = await ctx.stripeCli.invoices.retrieve(oldInvoiceId);
		expect(
			oldInvoice.status === "void" || oldInvoice.auto_advance === false,
		).toBe(true);
		const customerAfter =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const activeSubscription = customerAfter.subscriptions.find(
			(subscription) =>
				subscription.plan_id === pendingPlan.id &&
				subscription.status === "active",
		);
		expect(activeSubscription).toBeDefined();
		const endedSubscription = customerAfter.subscriptions.find(
			(subscription) => subscription.plan_id === live.id,
		);
		expect(endedSubscription).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: plan-only collection switch stays on the live plan")}`,
	async () => {
		const live = products.pro({
			id: "live",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pendingPlan = products.premium({
			id: "pending",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "enable-pending-regression",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [live, pendingPlan] }),
			],
			actions: [],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: live.id,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pendingPlan.id,
			invoice_mode: { enabled: true, issue_method: "send" },
		});
		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: live.id,
			invoice_mode: { enabled: true },
		});
		const liveRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(liveRows).toHaveLength(1);
		expect(liveRows[0].product.id).toBe(live.id);
		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows[0].id).toBe(pending.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: rejects deferred future phases")}`,
	async () => {
		const pro = products.pro({
			id: "future-phase-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const basic = products.base({
			id: "future-phase-basic",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { autumnV2_2, autumnV2_4, ctx, customer, customerId, advancedTo } =
			await initScenario({
				customerId: "enable-pending-future-phases",
				setup: [
					s.customer({ testClock: false, paymentMethod: "success" }),
					s.products({ list: [pro, basic] }),
				],
				actions: [],
			});
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: advancedTo + ms.days(30),
					plans: [{ plan_id: basic.id }],
				},
			],
			invoice_mode: { enabled: true, issue_method: "send" },
		});

		const pendingRowsForFuturePhases = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		const pending = pendingRowsForFuturePhases.find(
			(row) => row.product.id === pro.id,
		);
		expect(pending).toBeDefined();
		const editPreview = await autumnV2_2.subscriptions.previewUpdate({
			customer_id: customerId,
			customer_product_id: pending!.id,
			plan_id: pro.id,
			customize: {
				price: { amount: 7000, interval: BillingInterval.Month },
			},
			invoice_mode: { enabled: true },
		});
		expect(editPreview).toBeDefined();
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.subscriptions.update(
					enablePending({
						customerId,
						pendingId: pending!.id,
						planId: pro.id,
					}),
				),
		});
		const pendingAfter = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: ALL_STATUSES,
		});
		expect(pendingAfter.map((row) => row.id)).toContain(pending!.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: a live plan targeted by id still switches collection method")}`,
	async () => {
		const live = products.pro({
			id: "live-by-id",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "enable-pending-live-by-id",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [live] }),
			],
			actions: [],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: live.id,
		});
		const [liveRow] = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});

		await autumnV2_2.subscriptions.update(
			enablePending({
				customerId,
				pendingId: liveRow!.id,
				planId: live.id,
			}),
		);

		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			liveRow!.subscription_ids![0]!,
		);
		expect(stripeSubscription.collection_method).toBe("send_invoice");
	},
);

test.concurrent(
	`${chalk.yellowBright("enable pending plan: resets the billing cycle when asked, prorates by default")}`,
	async () => {
		const customerId = "enable-pending-reset-cycle";
		const live = products.pro({
			id: "reset-live",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pendingPlan = products.premium({
			id: "reset-pending",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV2_2, ctx, customer, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [live, pendingPlan] }),
			],
			actions: [
				s.billing.attach({ productId: live.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pendingPlan.id,
			invoice_mode: { enabled: true, issue_method: "send" },
		});
		const pending = await loadPending({
			ctx,
			internalCustomerId: customer!.internal_id,
		});
		const enable = enablePending({
			customerId,
			pendingId: pending.id,
			planId: pendingPlan.id,
		});

		const proratedPreview =
			await autumnV2_2.subscriptions.previewUpdate(enable);
		expect(proratedPreview.total).toBeCloseTo(
			await calculateProratedDiff({
				customerId,
				advancedTo,
				oldAmount: 20,
				newAmount: 50,
			}),
			0,
		);

		const resetTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		const reset = { ...enable, billing_cycle_anchor: "now" as const };
		const resetPreview = await autumnV2_2.subscriptions.previewUpdate(reset);
		expect(resetPreview.total).toBeCloseTo(resetTotal, 0);

		const result = await autumnV2_2.subscriptions.update(reset);
		expect(result.invoice?.status).toBe("open");
		expect(result.invoice?.total).toBeCloseTo(resetTotal, 0);
		const [active] = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(active!.product.id).toBe(pendingPlan.id);
	},
);
