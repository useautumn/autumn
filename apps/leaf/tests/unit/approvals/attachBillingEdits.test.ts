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
	test("reads API defaults and honors the authoritative access flag", () => {
		expect(
			attachBillingEditsFromRequest({
				...request,
				enable_plan_immediately: false,
				invoice_mode: {
					enabled: true,
					enable_plan_immediately: true,
				},
			}),
		).toEqual({
			access: "after_payment",
			invoice: "finalized",
			redirect: "if_required",
		});
	});

	test.each([
		["never", undefined],
		["if_required", true],
		["always", true],
	] as const)(
		"maps %s checkout using a long-lived link",
		(redirect, longLived) => {
			const parsed = applyAttachBillingEdits({
				edits: {
					access: "immediate",
					invoice: "disabled",
					redirect,
				},
				request,
			});

			expect(parsed.success).toBe(true);
			if (!parsed.success) return;
			expect(parsed.data).toMatchObject({
				customer_id: "cus_1",
				plan_id: "pro",
				customize: request.customize,
				enable_plan_immediately: true,
				metadata: request.metadata,
				redirect_mode: redirect,
			});
			expect(parsed.data.invoice_mode).toBeUndefined();
			expect(parsed.data.long_lived_checkout).toBe(longLived);
		},
	);

	test.each([
		["draft", false],
		["finalized", true],
	] as const)(
		"maps a %s invoice and preserves invoice settings",
		(invoice, finalize) => {
			const parsed = applyAttachBillingEdits({
				edits: {
					access: "after_payment",
					invoice,
					redirect: "never",
				},
				request,
			});

			expect(parsed.success).toBe(true);
			if (!parsed.success) return;
			expect(parsed.data.invoice_mode).toEqual({
				enabled: true,
				enable_plan_immediately: false,
				finalize,
				invoice_template_id: "template_1",
				net_terms_days: 30,
			});
			expect(parsed.data.enable_plan_immediately).toBe(false);
			expect(parsed.data.long_lived_checkout).toBeUndefined();
		},
	);

	test("rejects an invalid attach request", () => {
		const parsed = applyAttachBillingEdits({
			edits: {
				access: "after_payment",
				invoice: "disabled",
				redirect: "never",
			},
			request: { plan_id: "pro" },
		});

		expect(parsed.success).toBe(false);
	});
});
