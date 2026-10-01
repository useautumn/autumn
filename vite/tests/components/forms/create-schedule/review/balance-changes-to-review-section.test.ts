import { describe, expect, test } from "bun:test";
import type {
	Feature,
	SetPlansPreviewBalanceChange,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import { balanceChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/balanceChangesToReviewSection";

const credits = { id: "credits", name: "Credits" } as Feature;

const phaseWith = (
	balanceChanges: SetPlansPreviewBalanceChange[],
): SetPlansPreviewPhase => ({
	starts_at: 1_800_000_000_000,
	starts_now: true,
	ends_subscription: false,
	plans: [],
	plan_changes: [],
	balance_changes: balanceChanges,
	processor_items: [],
});

const creditsChange = (
	fields: Partial<SetPlansPreviewBalanceChange>,
): SetPlansPreviewBalanceChange => ({
	feature_id: "credits",
	entity_id: "ent_a",
	behavior: "updated",
	balance: {
		granted: 100_000,
		remaining: 100_000,
		usage: 0,
		unlimited: false,
		next_reset_at: null,
		overage_allowed: true,
	},
	previous_attributes: { granted: 10_000, remaining: 10_000 },
	...fields,
});

const rowsOf = (balanceChanges: SetPlansPreviewBalanceChange[]) =>
	balanceChangesToReviewSection({
		phases: [phaseWith(balanceChanges)],
		features: [credits],
	}).phases[0]?.rows ?? [];

describe("balanceChangesToReviewSection", () => {
	test("a pooled change carries the shared pool onto its contributor's row", () => {
		const [row] = rowsOf([
			creditsChange({
				pooled: { previous_total: 10_000, total: 100_000, contributors: 1 },
			}),
		]);

		expect(row?.description).toBe("10,000 → 100,000 granted · 0 used");
		expect(row?.pooled).toEqual({
			featureName: "Credits",
			previousTotal: 10_000,
			total: 100_000,
			contributors: 1,
		});
	});

	test("a change that pools nothing has no pool", () => {
		const [row] = rowsOf([creditsChange({})]);

		expect(row?.pooled).toBeUndefined();
	});
});
