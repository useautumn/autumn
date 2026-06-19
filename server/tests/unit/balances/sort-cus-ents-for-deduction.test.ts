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
