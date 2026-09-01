import { describe, expect, test } from "bun:test";
import { BillingOperationAction } from "@models/billingOperationModels/billingOperationTable";
import { parseBillingOperationId } from "@/internal/billing/operations/billingOperationId";
import {
	hashCanonicalBillingOperationRequest,
	parseCanonicalBillingOperationRequest,
} from "@/internal/billing/operations/canonicalBillingOperationRequest";

describe("billing operation canonicalization", () => {
	test("validates operation IDs inside the internal boundary", () => {
		expect(String(parseBillingOperationId("billing:attach_1.retry-2"))).toBe(
			"billing:attach_1.retry-2",
		);
		expect(() => parseBillingOperationId(" billing-1 ")).toThrow();
		expect(() => parseBillingOperationId("billing/1")).toThrow();
	});

	test("runtime-parses the request with the selected action schema", () => {
		const requestFromVariable: unknown = {
			customer_id: "cus_1",
			plan_id: "pro",
		};
		const actionFromVariable: BillingOperationAction =
			BillingOperationAction.CreateSchedule;

		expect(() =>
			parseCanonicalBillingOperationRequest({
				action: actionFromVariable,
				request: requestFromVariable,
			}),
		).toThrow();
	});

	test("returns the exact validated payload used for storage", () => {
		const canonicalRequest = parseCanonicalBillingOperationRequest({
			action: BillingOperationAction.Attach,
			request: {
				plan_id: "pro",
				customer_id: "cus_1",
				ignored_by_schema: "discarded",
			},
		});

		expect(canonicalRequest).toEqual({
			customer_id: "cus_1",
			plan_id: "pro",
			redirect_mode: "if_required",
		});
	});

	test("binds the canonical request hash to the billing action", () => {
		const request = {
			customer_id: "cus_1",
			plan_id: "pro",
			redirect_mode: "if_required",
		};
		const attachRequest = parseCanonicalBillingOperationRequest({
			action: BillingOperationAction.Attach,
			request,
		});
		const updateRequest = parseCanonicalBillingOperationRequest({
			action: BillingOperationAction.UpdateSubscription,
			request,
		});

		expect(attachRequest).toEqual(updateRequest);
		expect(
			hashCanonicalBillingOperationRequest({
				action: BillingOperationAction.Attach,
				canonicalRequest: attachRequest,
			}),
		).not.toBe(
			hashCanonicalBillingOperationRequest({
				action: BillingOperationAction.UpdateSubscription,
				canonicalRequest: updateRequest,
			}),
		);
	});
});
