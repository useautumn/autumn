import { describe, expect, test } from "bun:test";
import type { StateHandle } from "eve/context";
import { createPreviewLedger } from "../../../agent/lib/previewLedger.js";
import type { PreviewedRequest } from "../../../src/internal/approvals/utils/previewedRequest.js";

const request = {
	customer_id: "cus_1",
	customize: { price: { amount: 600, interval: "month" } },
	plan_id: "scale_1m",
};
const okResult = { content: [{ text: "{}", type: "text" }] };

/** The durable slot, as one session sees it. */
const sessionState = (): StateHandle<ReadonlyArray<PreviewedRequest>> => {
	let value: ReadonlyArray<PreviewedRequest> = [];
	return {
		get: () => value,
		update: (fn) => {
			value = fn(value);
		},
	};
};

const ledgerAfterPreview = () => {
	const ledger = createPreviewLedger(sessionState());
	ledger.recordPreview({
		args: { request },
		result: okResult,
		toolName: "previewAttach",
	});
	return ledger;
};

describe("preview ledger", () => {
	test("accepts a write matching a preview the session ran", () => {
		expect(
			ledgerAfterPreview().rejectionFor({
				args: { approval_description: "- Attach", request },
				toolName: "attach",
			}),
		).toBeUndefined();
	});

	// The Resend incident: previewed with `customize`, attached without it.
	test("refuses a write that differs from what the session previewed", () => {
		const { customize: _dropped, ...bare } = request;
		const rejection = ledgerAfterPreview().rejectionFor({
			args: { request: bare },
			toolName: "attach",
		});
		expect(rejection).toContain("`customize` was previewed as");
		expect(rejection).toContain("missing from the write");
		expect(rejection).toContain("Nothing was recorded");
	});

	test("refuses a write the session never previewed", () => {
		expect(
			createPreviewLedger(sessionState()).rejectionFor({
				args: { request },
				toolName: "attach",
			}),
		).toContain("never run through `previewAttach`");
	});

	test("ignores a preview the server rejected", () => {
		const ledger = createPreviewLedger(sessionState());
		ledger.recordPreview({
			args: { request },
			result: { content: [{ text: "boom", type: "text" }], isError: true },
			toolName: "previewAttach",
		});
		expect(
			ledger.rejectionFor({ args: { request }, toolName: "attach" }),
		).toContain("never run through");
	});

	test("ignores calls that are not previews", () => {
		const ledger = createPreviewLedger(sessionState());
		ledger.recordPreview({
			args: { request },
			result: okResult,
			toolName: "getCustomer",
		});
		expect(
			ledger.rejectionFor({ args: { request }, toolName: "attach" }),
		).toContain("never run through");
	});

	test("leaves writes without a comparable preview alone", () => {
		const ledger = createPreviewLedger(sessionState());
		for (const toolName of ["updateCustomer", "createEntity", "updatePlan"]) {
			expect(
				ledger.rejectionFor({ args: { request: { id: "x" } }, toolName }),
			).toBeUndefined();
		}
	});

	test("forgets the oldest previews of a busy session", () => {
		const ledger = createPreviewLedger(sessionState());
		for (let index = 0; index < 21; index += 1) {
			ledger.recordPreview({
				args: { request: { ...request, plan_id: `plan_${index}` } },
				result: okResult,
				toolName: "previewAttach",
			});
		}
		expect(
			ledger.rejectionFor({
				args: { request: { ...request, plan_id: "plan_0" } },
				toolName: "attach",
			}),
		).toContain("different request");
		expect(
			ledger.rejectionFor({
				args: { request: { ...request, plan_id: "plan_20" } },
				toolName: "attach",
			}),
		).toBeUndefined();
	});
});
