import { describe, expect, test } from "bun:test";
import {
	applyAttachBillingEdits,
	attachBillingEditsFromRequest,
} from "../../../src/internal/approvals/domain/attachBillingEdits.js";

const request = {
	customer_id: "cus_1",
	plan_id: "pro",
	customize: { price: { amount: 49, interval: "month" } },
	invoice_mode: {
		enabled: true,
		enable_plan_immediately: false,
		finalize: false,
		invoice_template_id: "template_1",
		net_terms_days: 30,
	},
	long_lived_checkout: false,
	metadata: { source: "slack" },
};

describe("attach billing edits", () => {
	test("reads the billing mode and the authoritative access flag", () => {
		expect(
			attachBillingEditsFromRequest({
				...request,
				enable_plan_immediately: false,
				invoice_mode: { enabled: true, enable_plan_immediately: true },
			}),
		).toEqual({ access: "after_payment", billing: "finalized_invoice" });
		expect(attachBillingEditsFromRequest(request)).toEqual({
			access: "after_payment",
			billing: "draft_invoice",
		});
		expect(
			attachBillingEditsFromRequest({
				customer_id: "cus_1",
				enable_plan_immediately: true,
				plan_id: "pro",
				redirect_mode: "always",
			}),
		).toEqual({ access: "immediate", billing: "checkout" });
	});

	test("checkout drops invoice mode and sends a long-lived link", () => {
		const parsed = applyAttachBillingEdits({
			edits: { access: "immediate", billing: "checkout" },
			request,
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data).toMatchObject({
			customer_id: "cus_1",
			customize: request.customize,
			enable_plan_immediately: true,
			long_lived_checkout: true,
			metadata: request.metadata,
			plan_id: "pro",
			redirect_mode: "always",
		});
		expect(parsed.data.invoice_mode).toBeUndefined();
	});

	test.each([
		["draft_invoice", false],
		["finalized_invoice", true],
	] as const)("%s keeps the invoice settings", (billing, finalize) => {
		const parsed = applyAttachBillingEdits({
			edits: { access: "after_payment", billing },
			request: { ...request, redirect_mode: "always" },
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data).toMatchObject({
			enable_plan_immediately: false,
			invoice_mode: {
				enable_plan_immediately: false,
				enabled: true,
				finalize,
				invoice_template_id: "template_1",
				net_terms_days: 30,
			},
			redirect_mode: "if_required",
		});
		expect(parsed.data.long_lived_checkout).toBeUndefined();
	});

	// The provisioning choice must land on both fields the API reads, or the
	// rebuilt request and the card disagree about when access starts.
	test("provisioning is written to the top-level and invoice flags together", () => {
		for (const access of ["immediate", "after_payment"] as const) {
			const parsed = applyAttachBillingEdits({
				edits: { access, billing: "draft_invoice" },
				request,
			});
			expect(parsed.success).toBe(true);
			if (!parsed.success) return;
			expect(parsed.data.enable_plan_immediately).toBe(access === "immediate");
			expect(parsed.data.invoice_mode?.enable_plan_immediately).toBe(
				access === "immediate",
			);
			expect(attachBillingEditsFromRequest(parsed.data).access).toBe(access);
		}
	});
});
