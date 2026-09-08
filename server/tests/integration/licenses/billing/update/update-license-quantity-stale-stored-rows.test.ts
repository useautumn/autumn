/**
 * Paid updates 1 -> 2 -> 3, then a preview to 4 while the latest invoice's
 * stored rows have not landed. Red: one seat credited, three charged. Green:
 * two credited, three charged.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectQuantityLineItemPairCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import chalk from "chalk";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

const SEAT_PRICE = 25;

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: credit covers every paid seat when stored rows lag the latest invoice")}`,
	async () => {
		const customerId = "license-update-quantity-stale-rows";
		const { autumnV1, autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-stale",
				seatPrice: SEAT_PRICE,
				includedSeats: 1,
				attachedSeats: 1,
			});

		const updateTo = (quantity: number) =>
			autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: parent.id,
				license_quantities: [{ license_plan_id: devSeat.id, quantity }],
				proration_behavior: "prorate_immediately",
			});

		const latestStripeInvoiceId = async () => {
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const stripeId = customer.invoices?.[0]?.stripe_id;
			expect(stripeId).toBeDefined();
			return stripeId as string;
		};
		const storedRowsFor = (stripeInvoiceId: string) =>
			invoiceLineItemRepo.getByStripeInvoiceId({ db: ctx.db, stripeInvoiceId });

		await updateTo(2);
		const firstInvoiceId = await latestStripeInvoiceId();
		await waitForInvoiceLineItems({
			stripeInvoiceId: firstInvoiceId,
			timeoutMs: 30_000,
		});

		await updateTo(3);

		const secondInvoiceId = await latestStripeInvoiceId();
		expect(secondInvoiceId).not.toEqual(firstInvoiceId);
		const secondRows = await waitForInvoiceLineItems({
			stripeInvoiceId: secondInvoiceId,
			timeoutMs: 30_000,
		});
		await invoiceLineItemRepo.deleteByInvoiceId({
			db: ctx.db,
			invoiceId: secondRows[0].invoice_id as string,
		});
		expect(await storedRowsFor(secondInvoiceId)).toHaveLength(0);

		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [{ license_plan_id: devSeat.id, quantity: 4 }],
					proration_behavior: "prorate_immediately",
				},
			);

		expectQuantityLineItemPairCorrect({
			preview,
			proratedOldTotal: 2 * SEAT_PRICE,
			proratedNewTotal: 3 * SEAT_PRICE,
			oldQuantity: 2,
			newQuantity: 3,
		});

		await updateTo(4);
		const settled = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: settled,
			count: 3,
			latestTotal: SEAT_PRICE,
		});
	},
);
