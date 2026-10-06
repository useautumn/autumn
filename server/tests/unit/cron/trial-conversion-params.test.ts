/**
 * A lapsed Autumn-managed trial attached in invoice mode converts by a finalized
 * invoice with the plan enabled immediately; any other trial charges the card.
 */

import { expect, test } from "bun:test";
import { CollectionMethod } from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { trialConversionParams } from "@/cron/productCron/trialConversionParams";

const trialCustomerProduct = ({
	collectionMethod,
}: {
	collectionMethod: CollectionMethod;
}) => ({
	...customerProducts.create({ productId: "pro" }),
	on_trial_end: "bill" as const,
	collection_method: collectionMethod,
});

test("send_invoice trial converts by invoice, without a payment behavior override", () => {
	expect(
		trialConversionParams({
			customerProduct: trialCustomerProduct({
				collectionMethod: CollectionMethod.SendInvoice,
			}),
		}),
	).toEqual({
		invoiceMode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: true,
		},
	});
});

test("charge_automatically trial converts with error_if_incomplete", () => {
	expect(
		trialConversionParams({
			customerProduct: trialCustomerProduct({
				collectionMethod: CollectionMethod.ChargeAutomatically,
			}),
		}),
	).toEqual({ paymentBehaviorIntent: "error_if_incomplete" });
});
