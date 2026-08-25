/**
 * Ayush asked for "usage will reset" on the approval card. The request params
 * cannot answer that — `recalculate_balances` is scoped to quantity updates —
 * so the card reads the preview's `resets_usage`, which the server derives from
 * the same predicate the executor uses to clear balances.
 */

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
