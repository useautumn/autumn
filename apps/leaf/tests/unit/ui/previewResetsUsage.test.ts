import { describe, expect, test } from "bun:test";
import { buildBillingPreviewDisplay } from "@autumn/render";

const display = (payload: Record<string, unknown>) =>
	buildBillingPreviewDisplay({
		preview: { currency: "usd", line_items: [], total: 0, ...payload },
	});

describe("preview resets_usage", () => {
	test("a transition that clears balances is surfaced", () => {
		expect(display({ resets_usage: true }).resetsUsage).toBe(true);
	});

	test("a transition that keeps balances is not", () => {
		expect(display({ resets_usage: false }).resetsUsage).toBe(false);
	});

	test("a preview from before the field existed reads as no reset", () => {
		expect(display({}).resetsUsage).toBe(false);
	});
});
