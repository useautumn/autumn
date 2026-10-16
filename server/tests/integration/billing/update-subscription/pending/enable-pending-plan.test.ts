import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	CusProductStatus,
	stripeToAtmnAmount,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
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
