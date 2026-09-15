import { describe, expect, test } from "bun:test";
import {
	comparableToolRequest,
	describeRequestDrift,
	findPreviewedRequest,
	unpreviewedWriteReason,
} from "../../../src/internal/approvals/utils/previewedRequest.js";

const customize = {
	add_items: [{ feature_id: "emails", included: 1_000_000 }],
	price: { amount: 600, interval: "month" },
	remove_items: [{ feature_id: "emails" }],
};
const previewedRequest = {
	customer_id: "cus_1",
	customize,
	plan_id: "transactional_scale_1m",
	proration_behavior: "prorate_immediately",
};
const previewed = [{ previewTool: "previewAttach", request: previewedRequest }];

describe("comparableToolRequest", () => {
	test("strips the walkthrough field the write carries beside its request", () => {
		expect(
			comparableToolRequest({
				approval_description: "- Attach",
				request: previewedRequest,
			}),
		).toEqual(previewedRequest);
	});

	test("strips it from a flat payload too", () => {
		expect(
			comparableToolRequest({
				approval_description: "- Attach",
				customer_id: "cus_1",
			}),
		).toEqual({ customer_id: "cus_1" });
	});

	test("has nothing to compare without a payload", () => {
		expect(comparableToolRequest(undefined)).toBeUndefined();
	});
});

describe("findPreviewedRequest", () => {
	test("matches regardless of key order", () => {
		expect(
			findPreviewedRequest({
				previewTool: "previewAttach",
				previewed,
				request: {
					proration_behavior: "prorate_immediately",
					plan_id: "transactional_scale_1m",
					customize,
					customer_id: "cus_1",
				},
			}),
		).toBe(previewed[0]);
	});

	test("never matches across preview tools", () => {
		expect(
			findPreviewedRequest({
				previewTool: "previewUpdateSubscription",
				previewed,
				request: previewedRequest,
			}),
		).toBeUndefined();
	});
});

describe("describeRequestDrift", () => {
	test("names a field the write dropped", () => {
		const { customize: _dropped, ...bare } = previewedRequest;
		expect(
			describeRequestDrift({ previewed: previewedRequest, request: bare }),
		).toBe(
			`\`customize\` was previewed as ${JSON.stringify(customize)} but is missing from the write`,
		);
	});

	test("names a field the write added and one it changed", () => {
		expect(
			describeRequestDrift({
				previewed: { customer_id: "cus_1", plan_id: "pro" },
				request: { customer_id: "cus_1", plan_id: "starter", trial: true },
			}),
		).toBe(
			'`plan_id` was previewed as "pro" but the write has "starter"; `trial` is true on the write but was not previewed',
		);
	});

	test("truncates a long value and caps the field list", () => {
		const previewedWide = Object.fromEntries(
			Array.from({ length: 8 }, (_, index) => [`f${index}`, index]),
		);
		const description = describeRequestDrift({
			previewed: { ...previewedWide, long: "x".repeat(300) },
			request: {},
		});
		expect(description).toContain("…and 3 more field(s)");
		expect(description).not.toContain("x".repeat(200));
	});
});

describe("unpreviewedWriteReason", () => {
	test("is silent for a write that matches a preview verbatim", () => {
		expect(
			unpreviewedWriteReason({
				previewTool: "previewAttach",
				previewed,
				request: previewedRequest,
				toolName: "attach",
			}),
		).toBeUndefined();
	});

	test("explains a write that drifted from its latest preview", () => {
		const { customize: _dropped, ...bare } = previewedRequest;
		expect(
			unpreviewedWriteReason({
				previewTool: "previewAttach",
				previewed,
				request: bare,
				toolName: "attach",
			}),
		).toBe(
			`\`attach\` was called with a different request from the one \`previewAttach\` last ran: \`customize\` was previewed as ${JSON.stringify(customize)} but is missing from the write.`,
		);
	});

	test("compares against the latest preview of that tool", () => {
		expect(
			unpreviewedWriteReason({
				previewTool: "previewAttach",
				previewed: [
					{ previewTool: "previewAttach", request: { plan_id: "starter" } },
					{ previewTool: "previewAttach", request: { plan_id: "pro" } },
				],
				request: { plan_id: "scale" },
				toolName: "attach",
			}),
		).toContain('`plan_id` was previewed as "pro"');
	});

	test("says so when nothing was previewed", () => {
		expect(
			unpreviewedWriteReason({
				previewTool: "previewAttach",
				previewed: [],
				request: previewedRequest,
				toolName: "attach",
			}),
		).toBe(
			"`attach` was called with a request that was never run through `previewAttach` in this session.",
		);
	});

	test("refuses a write with no request body", () => {
		expect(
			unpreviewedWriteReason({
				previewTool: "previewAttach",
				previewed,
				request: undefined,
				toolName: "attach",
			}),
		).toBe("`attach` was called without a request body.");
	});
});
