import { describe, expect, test } from "bun:test";
import {
	EMPTY_INVOICE_BILLING_DETAILS,
	invoiceBillingDetailsToParams,
} from "@/components/forms/attach-v2/utils/invoiceBillingDetails";

const typed = {
	...EMPTY_INVOICE_BILLING_DETAILS,
	country: "AU",
	address: "1 Martin Place\nLevel 12",
	city: "Sydney",
	taxIdOptionId: "AU:au_abn",
	taxIdValue: "12345678912",
};

describe("invoiceBillingDetailsToParams", () => {
	test("sends the typed address and tax ID", () => {
		const params = invoiceBillingDetailsToParams(typed);
		expect(params?.address).toMatchObject({
			country: "AU",
			line1: "1 Martin Place",
			line2: "Level 12",
		});
		expect(params?.tax_ids).toEqual([{ type: "au_abn", value: "12345678912" }]);
	});

	test("drops the hidden address once the customer is exempt", () => {
		const params = invoiceBillingDetailsToParams({
			...typed,
			taxExempt: "exempt",
		});
		expect(params?.address).toBeUndefined();
		expect(params?.tax_exempt).toBe("exempt");
		expect(params?.tax_ids).toHaveLength(1);
	});
});
