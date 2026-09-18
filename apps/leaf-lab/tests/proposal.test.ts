import { expect, test } from "bun:test";
import {
	checkPreview,
	describeProposal,
	parseProposal,
} from "../lib/proposal.js";

const request = {
	customer_id: "atlas",
	plan_id: "pro",
	invoice_mode: { enabled: true, finalize: false },
	enable_plan_immediately: true,
};
const preview = {
	customer_id: "atlas",
	plan_id: "pro",
	currency: "usd",
	total: 79,
};

test("structured proposals use the real Autumn request schema", () => {
	const parsed = parseProposal({
		operation: "attach",
		output: { status: "proposal", request },
	});
	expect(parsed.args.request).toMatchObject(request);
	expect(() =>
		parseProposal({
			operation: "attach",
			output: { status: "proposal", request: { customer_id: "atlas" } },
		}),
	).toThrow();
});

test("missing context and unsupported operations never become writes", () => {
	expect(() =>
		parseProposal({
			operation: "attach",
			output: { status: "needs_context", request: null },
		}),
	).toThrow("more context");
	expect(() =>
		parseProposal({
			operation: "createSchedule",
			output: { status: "proposal", request },
		}),
	).toThrow();
});

test("preview must confirm the proposal's customer and plan", () => {
	expect(checkPreview({ request, preview })).toMatchObject(preview);
	expect(() =>
		checkPreview({ request, preview: { ...preview, customer_id: "other" } }),
	).toThrow("customer");
	expect(() =>
		checkPreview({ request, preview: { ...preview, plan_id: "other" } }),
	).toThrow("plan");
	expect(() =>
		checkPreview({ request, preview: { ...preview, total: Number.NaN } }),
	).toThrow();
});

test("renderer uses preview facts without inventing payment dates", () => {
	const description = describeProposal({
		request,
		preview,
		customerName: "Atlas Labs",
		planName: "Pro",
	});
	expect(description).toContain("USD 79");
	expect(description).toContain("draft invoice");
	expect(description).toContain("Awaiting approval");
	expect(description).not.toContain("paid");
});
