import { describe, expect, test } from "bun:test";
import { shouldDisableAttachInvoiceButton } from "@/components/forms/attach-v2/utils/shouldDisableAttachInvoiceButton";

describe("shouldDisableAttachInvoiceButton", () => {
	test("allows invoice mode when it resolves the failed preview", () => {
		expect(
			shouldDisableAttachInvoiceButton({
				isPending: false,
				previewError:
					"Past starts_at cannot be used when Stripe Checkout is required.",
			}),
		).toBe(false);
	});

	test("keeps other preview failures and pending requests disabled", () => {
		expect(
			shouldDisableAttachInvoiceButton({
				isPending: false,
				previewError: "Past starts_at is too far in the past.",
			}),
		).toBe(true);
		expect(
			shouldDisableAttachInvoiceButton({ isPending: true }),
		).toBe(true);
	});
});
