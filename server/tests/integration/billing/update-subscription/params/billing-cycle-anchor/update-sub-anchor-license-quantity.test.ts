import { expect, test } from "bun:test";
import type {
	AttachLicenseParamsV0,
	BillingPreviewResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration/index.js";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

// Contract: license-only and combined resets converge quantities in place with one recurring
// refund/charge set, unchanged assignments and refund suppression with stored or catalog credits.
for (const variant of [
	{ name: "license-increase", seats: 3, nextSeats: 5 },
	{ name: "license-decrease", seats: 5, nextSeats: 3 },
	{ name: "license-none", seats: 3, nextSeats: 5, none: true },
	{ name: "license-catalog", seats: 3, nextSeats: 5, catalog: true },
	{
		name: "license-none-catalog",
		seats: 3,
		nextSeats: 5,
		none: true,
		catalog: true,
	},
	{ name: "combined", seats: 3, nextSeats: 5, nextPrepaid: 500 },
]) {
	test.concurrent(`anchor quantities: ${variant.name}`, async () => {
		const customerId = `anchor-qty-${variant.name}`;
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			seats: variant.seats,
		});
		const { autumnV2_4, ctx, advancedTo, licensePlan, target, plan } = scenario;
		await autumnV2_4.licenses.attach<AttachLicenseParamsV0>({
			customer_id: customerId,
			plan_id: licensePlan.id,
			entities: [{ entity_id: `${customerId}-assigned`, feature_id: "users" }],
		});
		if (variant.catalog) {
			const latestInvoice = scenario.subscription.latest_invoice;
			const stripeInvoiceId =
				typeof latestInvoice === "string" ? latestInvoice : latestInvoice?.id;
			if (!stripeInvoiceId) throw new Error("Expected attach invoice");
			const rows = await waitForInvoiceLineItems({
				stripeInvoiceId,
				timeoutMs: 30_000,
			});
			await invoiceLineItemRepo.deleteByInvoiceId({
				db: ctx.db,
				invoiceId: rows[0].invoice_id!,
			});
			expect(
				await invoiceLineItemRepo.getByStripeInvoiceId({
					db: ctx.db,
					stripeInvoiceId,
				}),
			).toHaveLength(0);
		}
		const before = await scenario.readProduct();
		const customerBefore = await scenario.readCustomer();
		const oldAmount = 50 + variant.seats * 20;
		const newAmount =
			20 + (variant.nextPrepaid ?? 300) / 10 + variant.nextSeats * 20;
		const expectedTotal = variant.none
			? newAmount
			: await calculateResetBillingCycleNowTotal({
					customerId,
					advancedTo,
					oldAmount,
					newAmount,
				});
		const params: UpdateSubscriptionV1ParamsInput = {
			...target,
			billing_cycle_anchor: "now",
			...(variant.none ? { proration_behavior: "none" as const } : {}),
			license_quantities: [
				{ license_plan_id: licensePlan.id, quantity: variant.nextSeats },
			],
			...(variant.nextPrepaid
				? {
						feature_quantities: [
							{ feature_id: "messages", quantity: variant.nextPrepaid },
						],
					}
				: {}),
		};
		const preview: BillingPreviewResponse =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(preview.total).toBeCloseTo(expectedTotal, 2);
		expect(preview.line_items).toHaveLength(variant.none ? 3 : 6);
		expect(
			preview.line_items
				.filter((line) => line.total > 0)
				.map((line) => line.total)
				.sort((a, b) => a - b),
		).toEqual(
			[20, (variant.nextPrepaid ?? 300) / 10, variant.nextSeats * 20].sort(
				(a, b) => a - b,
			),
		);
		expect(await scenario.readProduct()).toEqual(before);
		expect(await scenario.readCustomer()).toEqual(customerBefore);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const { product } = await expectAnchorQuantityIdentity({
			scenario,
			anchorMs: advancedTo,
		});
		if (!variant.nextPrepaid) expect(product.options).toEqual(before.options);
		expectCustomerLicenses({
			customer: await scenario.readCustomer(),
			count: 1,
			licenses: [
				{
					license_plan_id: licensePlan.id,
					parent_plan_id: plan.id,
					granted: variant.nextSeats,
					paid_quantity: variant.nextSeats,
					usage: 1,
					remaining: variant.nextSeats - 1,
				},
			],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			remaining: variant.nextPrepaid ?? 300,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	});
}
