import { expect } from "bun:test";
import {
	type ApiBillingDetails,
	type ApiCustomerV5,
	CustomerExpand,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const EMPTY_BILLING_DETAILS: ApiBillingDetails = {
	address: null,
	tax_ids: [],
	tax_exempt: "none",
	invoice_settings: { custom_fields: [] },
};

/** Reads billing_details through the expand (live from Stripe) and compares the full shape. */
export const expectBillingDetailsCorrect = async ({
	autumn,
	customerId,
	expected,
}: {
	autumn: AutumnInt;
	customerId: string;
	expected: Partial<ApiBillingDetails> | null;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.BillingDetails],
	});

	if (expected === null) {
		expect(customer.billing_details).toBeNull();
		return customer;
	}

	const byValue = (taxIds: ApiBillingDetails["tax_ids"]) =>
		[...taxIds].sort((a, b) => a.value.localeCompare(b.value));
	const expectedDetails = { ...EMPTY_BILLING_DETAILS, ...expected };

	expect({
		...customer.billing_details,
		tax_ids: byValue(customer.billing_details?.tax_ids ?? []),
	}).toEqual({ ...expectedDetails, tax_ids: byValue(expectedDetails.tax_ids) });
	return customer;
};
