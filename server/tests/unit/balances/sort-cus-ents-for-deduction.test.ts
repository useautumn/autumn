import { describe, expect, test } from "bun:test";
import {
	FeatureType,
	type FullCusEntWithFullCusProduct,
	sortCusEntsForDeduction,
} from "@autumn/shared";

const FUTURE_RESET = 9_999_999_999_000;

const makeCusEnt = ({
	id,
	type,
	usageAllowed,
	nextResetAt,
}: {
	id: string;
	type: FeatureType;
	usageAllowed: boolean;
	nextResetAt: number | null;
}) =>
	({
		id,
		usage_allowed: usageAllowed,
		next_reset_at: nextResetAt,
		created_at: 0,
		entitlement: { feature: { id, type } },
	}) as unknown as FullCusEntWithFullCusProduct;

const idsAfterSort = (cusEnts: FullCusEntWithFullCusProduct[]) => {
	sortCusEntsForDeduction({ cusEnts });
	return cusEnts.map((cusEnt) => cusEnt.id);
};

describe("sortCusEntsForDeduction — AI credit cascade ordering", () => {
	// The capped/included AI credit system has no reset cadence (one-time credit);
	// the overage one resets monthly. next_reset_at outranks usage_allowed for
	// every other feature type, so without the AI-credit-scoped tiebreak the
	// resetting overage system would drain first and charge the markup before the
	// free included usage. The cascade requires included-first regardless.
	const makeIncluded = () =>
		makeCusEnt({
			id: "included",
			type: FeatureType.AiCreditSystem,
			usageAllowed: false,
			nextResetAt: null,
		});
	const makeOverage = () =>
		makeCusEnt({
			id: "overage",
			type: FeatureType.AiCreditSystem,
			usageAllowed: true,
			nextResetAt: FUTURE_RESET,
		});

	test("included (capped, no reset) drains before overage (resetting)", () => {
		expect(idsAfterSort([makeOverage(), makeIncluded()])).toEqual([
			"included",
			"overage",
		]);
	});

	test("ordering is stable regardless of input order", () => {
		expect(idsAfterSort([makeIncluded(), makeOverage()])).toEqual([
			"included",
			"overage",
		]);
	});

	test("non-AI-credit features keep the existing reset-first ordering", () => {
		// Two metered features: the resetting one must still go first even though it
		// allows overage — the AI-credit-scoped tiebreak must not touch them.
		const capped = makeCusEnt({
			id: "capped",
			type: FeatureType.Metered,
			usageAllowed: false,
			nextResetAt: null,
		});
		const resetting = makeCusEnt({
			id: "resetting",
			type: FeatureType.Metered,
			usageAllowed: true,
			nextResetAt: FUTURE_RESET,
		});

		expect(idsAfterSort([capped, resetting])).toEqual(["resetting", "capped"]);
	});
});
