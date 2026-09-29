import { describe, expect, test } from "bun:test";
import type { PreviewBalanceChange } from "@autumn/shared";
import { classifySetPlansBalanceChange } from "@/internal/billing/v2/actions/setPlans/preview/classifySetPlansBalanceChange";

const balanceChange = ({
	balance,
	previousAttributes,
}: {
	balance: Partial<PreviewBalanceChange["balance"]>;
	previousAttributes: Record<string, unknown>;
}): PreviewBalanceChange => ({
	feature_id: "credits",
	balance: {
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		next_reset_at: null,
		...balance,
	},
	previous_attributes: previousAttributes,
});

const behaviorOf = (change: PreviewBalanceChange) =>
	classifySetPlansBalanceChange(change).behavior;

describe("classifySetPlansBalanceChange", () => {
	test("usage kept across a grant change is carried over, and usage cleared is reset", () => {
		expect(
			behaviorOf(
				balanceChange({
					balance: { granted: 500, remaining: 260, usage: 240 },
					previousAttributes: { granted: 100 },
				}),
			),
		).toBe("carried");
		expect(
			behaviorOf(
				balanceChange({
					balance: { granted: 100, remaining: 100, usage: 0 },
					previousAttributes: { granted: 500, usage: 240 },
				}),
			),
		).toBe("reset");
	});

	test("granting or removing unlimited access reads as added or removed", () => {
		expect(
			behaviorOf(
				balanceChange({
					balance: { unlimited: true },
					previousAttributes: { unlimited: false },
				}),
			),
		).toBe("added");
		expect(
			behaviorOf(
				balanceChange({
					balance: { unlimited: false },
					previousAttributes: { unlimited: true },
				}),
			),
		).toBe("removed");
	});
});
