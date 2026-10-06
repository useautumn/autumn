/**
 * An Autumn-managed no-card bill trial attached in invoice mode stores
 * collection_method send_invoice, so the product cron invoices it at trial end.
 * Every other trial keeps the default charge_automatically.
 */

import { expect, test } from "bun:test";
import {
	type AttachBillingContext,
	BillingVersion,
	CollectionMethod,
	type InvoiceMode,
	type TrialContext,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { products } from "@tests/utils/fixtures/db/products";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";

const NOW_MS = 1_760_000_000_000;
const TRIAL_ENDS_AT_MS = NOW_MS + 7 * 24 * 60 * 60 * 1000;

const INVOICE_MODE: InvoiceMode = {
	finalizeInvoice: true,
	enableProductImmediately: false,
};

const noCardTrial = ({
	autumnManaged,
	onEnd,
}: {
	autumnManaged: boolean;
	onEnd?: TrialContext["onEnd"];
}): TrialContext => ({
	trialEndsAt: TRIAL_ENDS_AT_MS,
	appliesToBilling: true,
	cardRequired: false,
	autumnManaged,
	onEnd,
});

const collectionMethodFor = ({
	trialContext,
	invoiceMode,
	planTiming = "immediate",
}: {
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
	planTiming?: AttachBillingContext["planTiming"];
}) =>
	computeAttachNewCustomerProduct({
		ctx: contexts.create({}),
		attachBillingContext: {
			fullCustomer: customers.create({}),
			attachProduct: products.createFull({ id: "pro" }),
			fullProducts: [],
			featureQuantities: [],
			currentEpochMs: NOW_MS,
			billingCycleAnchorMs: TRIAL_ENDS_AT_MS,
			resetCycleAnchorMs: TRIAL_ENDS_AT_MS,
			customPrices: [],
			customEnts: [],
			isCustom: false,
			billingVersion: BillingVersion.V2,
			planTiming,
			checkoutMode: null,
			trialContext,
			invoiceMode,
		} as AttachBillingContext,
	}).collection_method;

test("Autumn-managed bill trial + invoice mode → send_invoice", () => {
	expect(
		collectionMethodFor({
			trialContext: noCardTrial({ autumnManaged: true }),
			invoiceMode: INVOICE_MODE,
		}),
	).toBe(CollectionMethod.SendInvoice);
});

test("Autumn-managed bill trial without invoice mode → charge_automatically", () => {
	expect(
		collectionMethodFor({
			trialContext: noCardTrial({ autumnManaged: true }),
		}),
	).toBe(CollectionMethod.ChargeAutomatically);
});

test("Stripe-run no-card trial + invoice mode → charge_automatically", () => {
	expect(
		collectionMethodFor({
			trialContext: noCardTrial({ autumnManaged: false }),
			invoiceMode: INVOICE_MODE,
		}),
	).toBe(CollectionMethod.ChargeAutomatically);
});

test("revert trial + invoice mode → charge_automatically", () => {
	expect(
		collectionMethodFor({
			trialContext: noCardTrial({ autumnManaged: true, onEnd: "revert" }),
			invoiceMode: INVOICE_MODE,
		}),
	).toBe(CollectionMethod.ChargeAutomatically);
});

test("invoice mode without a trial → charge_automatically", () => {
	expect(collectionMethodFor({ invoiceMode: INVOICE_MODE })).toBe(
		CollectionMethod.ChargeAutomatically,
	);
});
