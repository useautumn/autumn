/**
 * Editing or cancelling a pending plan that replaces the customer's live plan.
 *
 * Red (before): an edit re-attached the pending plan, and attach rejected it because
 * the same plan was still live (409 plan_already_attached). A cancel preview showed a
 * refund for the unpaid plan.
 * Green (after): an edit replaces the pending change on the live plan, and a cancel
 * previews and leaves only the live plan.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customers,
	type FullCusProduct,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const monthly = (amount: number) => ({
	price: { amount, interval: BillingInterval.Month },
});

const priceOf = (customerProduct: FullCusProduct) =>
	customerProduct.customer_prices
		.map((customerPrice) => customerPrice.price.config as { amount?: number })
		.find((config) => (config.amount ?? 0) >= 1)?.amount;

const regionsOf = (customerProduct: FullCusProduct) =>
	customerProduct.options.find(
		(option) => option.feature_id === TestFeature.Messages,
	)?.quantity;

/** A $1,000 invoiced plan (3 prepaid regions) with an unpaid $8,000 change to 5 regions waiting on an open invoice. */
const setupPendingReplacement = async ({
	name,
	onEntity = false,
}: {
	name: string;
	onEntity?: boolean;
}) => {
	const customerId = `${name}-${Date.now()}`;
	const dedicated = products.base({
		id: `dedicated-${name}`,
		items: [
			items.monthlyPrice({ price: 1000 }),
			items.prepaid({
				featureId: TestFeature.Messages,
				price: 100,
				billingUnits: 1,
			}),
			items.consumable({ featureId: TestFeature.Words, price: 0.05 }),
		],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.products({ list: [dedicated] }),
			s.customer({}),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});
	const { autumnV2_4, ctx, entities } = scenario;
	const entityId = onEntity ? entities[0]!.id : undefined;
	await autumnV2_4.billing.attach({
		customer_id: customerId,
		entity_id: entityId,
		plan_id: dedicated.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 3 }],
		invoice_mode: { enabled: true, enable_plan_immediately: true },
	});
	await autumnV2_4.billing.setPlans({
		customer_id: customerId,
		entity_id: entityId,
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: dedicated.id,
						customize: monthly(8000),
						feature_quantities: [
							{ feature_id: TestFeature.Messages, quantity: 5 },
						],
					},
				],
			},
		],
		invoice_mode: { enabled: true },
	});

	const listRows = async () => {
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		return CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Pending],
		});
	};
	const rows = await listRows();
	const live = rows.find((row) => row.status === CusProductStatus.Active)!;
	const pending = rows.find((row) => row.status === CusProductStatus.Pending)!;
	expect(priceOf(pending)).toBe(8000);
	expect(regionsOf(pending)).toBe(5);

	const pendingInvoiceId = async (customerProduct: FullCusProduct) =>
		(
			await MetadataService.get({
				db: ctx.db,
				id: customerProduct.metadata_id!,
			})
		)?.stripe_invoice_id;

	return {
		...scenario,
		customerId,
		entityId,
		dedicated,
		live,
		pending,
		listRows,
		pendingInvoiceId,
	};
};

test.concurrent(
	`${chalk.yellowBright("pending replacement: opening and editing the pending plan replaces the unpaid change")}`,
	async () => {
		const {
			autumnV1,
			autumnV2_2,
			ctx,
			customerId,
			dedicated,
			live,
			pending,
			listRows,
			pendingInvoiceId,
		} = await setupPendingReplacement({ name: "pending-repl-edit" });
		const oldInvoiceId = await pendingInvoiceId(pending);

		// The dashboard's Update sheet opens with this exact request.
		const unchanged = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			customer_product_id: pending.id,
			product_id: dedicated.id,
			upsert_licenses: [],
		});
		// Unchanged, it previews what the unpaid change's open invoice already asks for.
		const oldInvoice = await ctx.stripeCli.invoices.retrieve(oldInvoiceId!);
		expect(unchanged.total * 100).toBe(oldInvoice.total);

		// A failed edit leaves the unpaid change and its invoice untouched.
		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				customer_product_id: pending.id,
				plan_id: dedicated.id,
				feature_quantities: [{ feature_id: TestFeature.Users, quantity: 2 }],
			}),
		).rejects.toThrow();
		expect((await listRows()).map((row) => row.id).sort()).toEqual(
			[live.id, pending.id].sort(),
		);
		expect((await ctx.stripeCli.invoices.retrieve(oldInvoiceId!)).status).toBe(
			"open",
		);

		const edit: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			customer_product_id: pending.id,
			plan_id: dedicated.id,
			customize: monthly(6000),
			invoice_mode: { enabled: true },
		};
		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				edit,
			);
		expect(preview.total).toBe(unchanged.total - 2000);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			edit,
		);

		const rows = await listRows();
		const pendingRows = rows.filter(
			(row) => row.status === CusProductStatus.Pending,
		);
		expect(pendingRows).toHaveLength(1);
		expect(priceOf(pendingRows[0]!)).toBe(6000);
		expect(regionsOf(pendingRows[0]!)).toBe(5);
		expect(rows.find((row) => row.id === live.id)?.status).toBe(
			CusProductStatus.Active,
		);
		const voidedInvoice = await ctx.stripeCli.invoices.retrieve(oldInvoiceId!);
		expect(voidedInvoice.status).toBe("void");
		const newInvoice = await ctx.stripeCli.invoices.retrieve(
			(await pendingInvoiceId(pendingRows[0]!))!,
		);
		expect(newInvoice.status).toBe("open");
		expect(newInvoice.total).toBe(preview.total * 100);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending replacement: enabling the unpaid change immediately applies it and keeps its invoice to collect")}`,
	async () => {
		const { autumnV2_2, ctx, customerId, dedicated, live, pending, listRows } =
			await setupPendingReplacement({ name: "pending-repl-enable" });

		const result =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				customer_product_id: pending.id,
				plan_id: dedicated.id,
				invoice_mode: { enabled: true, enable_plan_immediately: true },
			});

		const rows = await listRows();
		expect(
			rows.filter((row) => row.status === CusProductStatus.Pending),
		).toHaveLength(0);
		const [active] = rows.filter(
			(row) => row.status === CusProductStatus.Active,
		);
		expect(rows).toHaveLength(1);
		expect(active!.id).not.toBe(live.id);
		expect(priceOf(active!)).toBe(8000);
		expect(regionsOf(active!)).toBe(5);
		const invoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice.stripe_id,
		);
		expect(invoice.status).toBe("open");
		expect(invoice.total).toBeGreaterThan(0);
	},
);

for (const onEntity of [false, true]) {
	test.concurrent(
		`${chalk.yellowBright(`pending replacement: cancelling ${onEntity ? "an entity's" : "the"} unpaid change previews nothing due and keeps the live plan`)}`,
		async () => {
			const {
				autumnV2_2,
				ctx,
				customerId,
				entityId,
				dedicated,
				live,
				pending,
				listRows,
				pendingInvoiceId,
			} = await setupPendingReplacement({
				name: `pending-repl-cancel-${onEntity ? "entity" : "customer"}`,
				onEntity,
			});
			const invoiceId = await pendingInvoiceId(pending);
			const cancel: UpdateSubscriptionV1ParamsInput = {
				customer_id: customerId,
				entity_id: entityId,
				customer_product_id: pending.id,
				plan_id: dedicated.id,
				cancel_action: "cancel_immediately",
			};

			const preview =
				await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
					cancel,
				);
			expect(preview.total).toBe(0);
			expect(
				preview.line_items.filter(
					(lineItem: { total: number }) => lineItem.total !== 0,
				),
			).toHaveLength(0);

			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				cancel,
			);

			const rows = await listRows();
			expect(rows.map((row) => [row.id, row.status])).toEqual([
				[live.id, CusProductStatus.Active],
			]);
			const invoice = await ctx.stripeCli.invoices.retrieve(invoiceId!);
			expect(invoice.status).toBe("void");
		},
	);
}
