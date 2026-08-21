import { describe, expect, test } from "bun:test";
import {
	applyBillingEdits,
	billingEditsFromRequest,
	billingOptionsFor,
} from "../../../src/internal/approvals/domain/billingEdits.js";

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

describe("billing edits", () => {
	test("reads the billing mode and the authoritative access flag", () => {
		expect(
			billingEditsFromRequest({
				request: {
					...request,
					enable_plan_immediately: false,
					invoice_mode: { enabled: true, enable_plan_immediately: true },
				},
				toolName: "attach",
			}),
		).toEqual({
			access: "after_payment",
			billing: "finalized_invoice",
			proration: "immediate",
		});
		expect(billingEditsFromRequest({ request, toolName: "attach" })).toEqual({
			access: "after_payment",
			billing: "draft_invoice",
			proration: "immediate",
		});
		expect(
			billingEditsFromRequest({
				request: {
					customer_id: "cus_1",
					enable_plan_immediately: true,
					plan_id: "pro",
					redirect_mode: "always",
				},
				toolName: "attach",
			}),
		).toEqual({
			access: "immediate",
			billing: "checkout",
			proration: "immediate",
		});
	});

	test("checkout drops invoice mode and sends a long-lived link", () => {
		const parsed = applyBillingEdits({
			edits: {
				access: "immediate",
				billing: "checkout",
				proration: "immediate",
			},
			request,
			toolName: "attach",
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
		const parsed = applyBillingEdits({
			edits: { access: "after_payment", billing, proration: "immediate" },
			request: { ...request, redirect_mode: "always" },
			toolName: "attach",
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
		expect(
			(parsed.data as { long_lived_checkout?: boolean }).long_lived_checkout,
		).toBeUndefined();
	});

	// The provisioning choice must land on both fields the API reads, or the
	// rebuilt request and the card disagree about when access starts.
	test("provisioning is written to the top-level and invoice flags together", () => {
		for (const access of ["immediate", "after_payment"] as const) {
			const parsed = applyBillingEdits({
				edits: { access, billing: "draft_invoice", proration: "immediate" },
				request,
				toolName: "attach",
			});
			expect(parsed.success).toBe(true);
			if (!parsed.success) return;
			expect(
				(parsed.data as { enable_plan_immediately?: boolean })
					.enable_plan_immediately,
			).toBe(access === "immediate");
			expect(parsed.data.invoice_mode?.enable_plan_immediately).toBe(
				access === "immediate",
			);
			expect(
				billingEditsFromRequest({ request: parsed.data, toolName: "attach" })
					.access,
			).toBe(access);
		}
	});
});

// Proration is the third operator decision: whether an existing subscription
// is trued up now, at the next cycle, or per the plan default.
describe("proration edits", () => {
	test("reads proration off the request, org default when omitted", () => {
		expect(
			billingEditsFromRequest({
				request: { ...request, proration_behavior: "none" },
				toolName: "attach",
			}).proration,
		).toBe("next_cycle");
		expect(
			billingEditsFromRequest({
				request: { ...request, proration_behavior: "prorate_immediately" },
				toolName: "attach",
			}).proration,
		).toBe("immediate");
		expect(
			billingEditsFromRequest({ request, toolName: "attach" }).proration,
		).toBe("immediate");
	});

	test.each([
		["immediate", "prorate_immediately"],
		["next_cycle", "none"],
	] as const)("%s writes proration_behavior", (proration, expected) => {
		const parsed = applyBillingEdits({
			edits: { access: "after_payment", billing: "draft_invoice", proration },
			request: { ...request, proration_behavior: "none" },
			toolName: "attach",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.proration_behavior).toBe(expected);
	});

	// A request that never carried proration keeps the org default unless the
	// user actively changes the selection — "none" breaks brand-new subs.
	test("an untouched selection on an omitted proration stays omitted", () => {
		const parsed = applyBillingEdits({
			edits: {
				access: "after_payment",
				billing: "draft_invoice",
				proration: "immediate",
			},
			request,
			toolName: "attach",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.proration_behavior).toBeUndefined();
	});

	test("changing the selection on an omitted proration writes it", () => {
		const parsed = applyBillingEdits({
			edits: {
				access: "after_payment",
				billing: "draft_invoice",
				proration: "next_cycle",
			},
			request,
			toolName: "attach",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.proration_behavior).toBe("none");
	});
});

// Updates have no checkout flow and no top-level provisioning flag — the
// same edits shape maps onto the update schema without either.
describe("updateSubscription edits", () => {
	const updateRequest = {
		cancel_action: "cancel_end_of_cycle",
		customer_id: "cus_1",
		plan_id: "pro",
		proration_behavior: "none",
	};

	test("offers charge directly instead of checkout", () => {
		expect(billingOptionsFor("updateSubscription")).toEqual([
			"charge_directly",
			"draft_invoice",
			"finalized_invoice",
		]);
		expect(billingOptionsFor("attach")).toEqual([
			"checkout",
			"draft_invoice",
			"finalized_invoice",
		]);
	});

	test("reads charge_directly when no invoice mode is set", () => {
		expect(
			billingEditsFromRequest({
				request: updateRequest,
				toolName: "updateSubscription",
			}),
		).toEqual({
			access: "after_payment",
			billing: "charge_directly",
			proration: "next_cycle",
		});
	});

	test("keeps cancel_action and writes proration on the update schema", () => {
		const parsed = applyBillingEdits({
			edits: {
				access: "after_payment",
				billing: "charge_directly",
				proration: "immediate",
			},
			request: updateRequest,
			toolName: "updateSubscription",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data).toMatchObject({
			cancel_action: "cancel_end_of_cycle",
			customer_id: "cus_1",
			proration_behavior: "prorate_immediately",
		});
		expect(
			(parsed.data as { enable_plan_immediately?: boolean })
				.enable_plan_immediately,
		).toBeUndefined();
		expect(parsed.data.invoice_mode).toBeUndefined();
	});

	test("invoice mode carries provisioning inside invoice_mode only", () => {
		const parsed = applyBillingEdits({
			edits: {
				access: "immediate",
				billing: "draft_invoice",
				proration: "next_cycle",
			},
			request: updateRequest,
			toolName: "updateSubscription",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.invoice_mode).toMatchObject({
			enable_plan_immediately: true,
			enabled: true,
			finalize: false,
		});
		expect(
			(parsed.data as { enable_plan_immediately?: boolean })
				.enable_plan_immediately,
		).toBeUndefined();
	});
});
