import { expect, test } from "bun:test";
import { PAST_START_REQUIRES_INVOICE } from "@autumn/shared";
import {
	getInvoiceButtonState,
	shouldDisableInvoiceButton,
} from "@/components/forms/shared/utils/invoiceButtonState";

test("allows invoice mode when it resolves the failed preview", () => {
	expect(
		shouldDisableInvoiceButton({
			isPending: false,
			previewError: PAST_START_REQUIRES_INVOICE,
		}),
	).toBe(false);
});

test("disables other preview failures and pending requests", () => {
	expect(
		shouldDisableInvoiceButton({
			isPending: false,
			previewError: "Past starts_at is too far in the past.",
		}),
	).toBe(true);
	expect(shouldDisableInvoiceButton({ isPending: true })).toBe(true);
});

test("ignores a retained zero-dollar preview after the current preview fails", () => {
	expect(
		getInvoiceButtonState({
			preview: { total: 0 },
			previewFailed: true,
			createsRecurringSubscription: true,
		}).isInvoiceOnlyStart,
	).toBe(false);
});
