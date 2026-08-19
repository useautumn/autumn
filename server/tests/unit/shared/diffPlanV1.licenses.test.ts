/**
 * diffPlanV1 license lanes: upsert_licenses / remove_licenses, keyed by
 * license_plan_id. Link fields only (included, prepaid_only, customize).
 * version and expanded plan are ignored. No licenses on input → no license lane.
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type ApiPlanLicenseV1,
	type ApiPlanV1,
	BillingInterval,
	type DiffedCustomizePlanV1,
} from "@autumn/shared";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import {
	customizePlanV1DiffsEqual,
	diffPlanV1,
} from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";

type DiffablePlan = ApiPlanV1 & { licenses?: ApiPlanLicenseV1[] };

const makePlan = (overrides?: Partial<DiffablePlan>): DiffablePlan => ({
	id: "team",
	name: "Team",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items: [],
	created_at: 0,
	env: AppEnv.Sandbox,
	archived: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	metadata: {},
	...overrides,
});

const license = (
	overrides: Omit<Partial<ApiPlanLicenseV1>, "customize"> & {
		license_plan_id: string;
		customize?: ApiPlanLicenseV1["customize"] | null;
	},
): ApiPlanLicenseV1 =>
	({
		version: 1,
		included: 2,
		prepaid_only: true,
		...overrides,
	}) as ApiPlanLicenseV1;

const monthPrice = ({ amount }: { amount: number }) => ({
	amount,
	interval: BillingInterval.Month,
});

const diffOf = ({
	from,
	to,
}: {
	from?: DiffablePlan["licenses"];
	to?: DiffablePlan["licenses"];
}): DiffedCustomizePlanV1 =>
	diffPlanV1({
		from: makePlan({ licenses: from }),
		to: makePlan({ licenses: to }),
	});

describe("diffPlanV1 licenses — empty / identity", () => {
	test("no licenses field → no license lanes (existing callers)", () => {
		expect(diffPlanV1({ from: makePlan(), to: makePlan() })).toEqual({});
	});

	test("undefined vs [] are the same empty set", () => {
		expect(diffOf({ from: undefined, to: [] })).toEqual({});
		expect(diffOf({ from: [], to: undefined })).toEqual({});
	});

	test("identical licenses → empty", () => {
		const seat = license({ license_plan_id: "seat" });
		expect(diffOf({ from: [seat], to: [seat] })).toEqual({});
	});

	test("order does not matter", () => {
		const seat = license({ license_plan_id: "seat" });
		const pack = license({ license_plan_id: "pack", included: 5 });
		expect(diffOf({ from: [seat, pack], to: [pack, seat] })).toEqual({});
	});

	test("version and expanded plan are ignored", () => {
		const from = license({
			license_plan_id: "seat",
			version: 1,
			plan: makePlan({ id: "seat", name: "Old" }) as ApiPlanLicenseV1["plan"],
		});
		const to = license({
			license_plan_id: "seat",
			version: 2,
			plan: makePlan({ id: "seat", name: "New" }) as ApiPlanLicenseV1["plan"],
		});
		expect(diffOf({ from: [from], to: [to] })).toEqual({});
	});

	test("omitted customize vs null vs {} are the same", () => {
		const id = { license_plan_id: "seat" as const };
		expect(
			diffOf({
				from: [license({ ...id })],
				to: [license({ ...id, customize: null })],
			}),
		).toEqual({});
		expect(
			diffOf({
				from: [license({ ...id, customize: {} })],
				to: [license({ ...id })],
			}),
		).toEqual({});
	});
});

// Added and removed links are link lifecycle, not plan terms — the diff only
// carries changes to links present on both sides.
describe("diffPlanV1 licenses — add / remove are link lifecycle", () => {
	test("new license → no lane", () => {
		const seat = license({
			license_plan_id: "seat",
			included: 3,
			customize: { price: monthPrice({ amount: 20 }) },
		});
		expect(diffOf({ from: [], to: [seat] })).toEqual({});
	});

	test("dropped license → no lane", () => {
		expect(
			diffOf({
				from: [license({ license_plan_id: "seat" })],
				to: [],
			}),
		).toEqual({});
	});

	test("swap A for B → no lane (both are lifecycle)", () => {
		expect(
			diffOf({
				from: [license({ license_plan_id: "seat" })],
				to: [license({ license_plan_id: "pack", included: 5 })],
			}),
		).toEqual({});
	});

	test("same id never appears in both lanes", () => {
		const diff = diffOf({
			from: [license({ license_plan_id: "seat", included: 2 })],
			to: [license({ license_plan_id: "seat", included: 5 })],
		});
		const upserted = new Set(
			(diff.upsert_licenses ?? []).map((entry) => entry.license_plan_id),
		);
		for (const removed of diff.remove_licenses ?? []) {
			expect(upserted.has(removed.license_plan_id)).toBe(false);
		}
	});
});

describe("diffPlanV1 licenses — field changes", () => {
	test("included change → upsert next included (0 is kept)", () => {
		expect(
			diffOf({
				from: [license({ license_plan_id: "seat", included: 2 })],
				to: [license({ license_plan_id: "seat", included: 0 })],
			}),
		).toEqual({
			upsert_licenses: [
				{ license_plan_id: "seat", included: 0, prepaid_only: true },
			],
		});
	});

	test("prepaid_only change → upsert", () => {
		expect(
			diffOf({
				from: [license({ license_plan_id: "seat", prepaid_only: true })],
				to: [license({ license_plan_id: "seat", prepaid_only: false })],
			}),
		).toEqual({
			upsert_licenses: [
				{ license_plan_id: "seat", included: 2, prepaid_only: false },
			],
		});
	});

	test("customize overlay change → upsert next customize", () => {
		expect(
			diffOf({
				from: [
					license({
						license_plan_id: "seat",
						customize: { price: monthPrice({ amount: 10 }) },
					}),
				],
				to: [
					license({
						license_plan_id: "seat",
						customize: { price: monthPrice({ amount: 20 }) },
					}),
				],
			}),
		).toEqual({
			upsert_licenses: [
				{
					license_plan_id: "seat",
					included: 2,
					prepaid_only: true,
					customize: { price: monthPrice({ amount: 20 }) },
				},
			],
		});
	});

	test("clear overlay → upsert customize: null", () => {
		expect(
			diffOf({
				from: [
					license({
						license_plan_id: "seat",
						customize: { price: monthPrice({ amount: 15 }) },
					}),
				],
				to: [license({ license_plan_id: "seat" })],
			}),
		).toEqual({
			upsert_licenses: [
				{
					license_plan_id: "seat",
					included: 2,
					prepaid_only: true,
					customize: null,
				},
			],
		});
	});
});

describe("diffPlanV1 licenses — mixed set", () => {
	test("one added, one removed, one changed, one same → only the change upserts", () => {
		const diff = diffOf({
			from: [
				license({ license_plan_id: "keep" }),
				license({ license_plan_id: "drop" }),
				license({ license_plan_id: "edit", included: 2 }),
			],
			to: [
				license({ license_plan_id: "keep" }),
				license({ license_plan_id: "edit", included: 9 }),
				license({ license_plan_id: "add", included: 1 }),
			],
		});
		expect(diff.remove_licenses).toBeUndefined();
		expect(diff.upsert_licenses).toEqual([
			{ license_plan_id: "edit", included: 9, prepaid_only: true },
		]);
	});

	test("lanes are sorted by license_plan_id", () => {
		const diff = diffOf({
			from: [
				license({ license_plan_id: "zeta", included: 2 }),
				license({ license_plan_id: "alpha", included: 2 }),
			],
			to: [
				license({ license_plan_id: "zeta", included: 9 }),
				license({ license_plan_id: "alpha", included: 9 }),
			],
		});
		expect(diff.upsert_licenses?.map((entry) => entry.license_plan_id)).toEqual([
			"alpha",
			"zeta",
		]);
	});
});

describe("diffPlanV1 licenses — applyDiff round-trip", () => {
	test("no license lane → applyDiff does not invent a licenses key", () => {
		const result = applyDiff({
			base: makePlan(),
			diff: { price: null },
		});
		expect(result).not.toHaveProperty("licenses");
	});

	test("field changes reconstruct the to set (lifecycle is not diffed)", () => {
		const from = makePlan({
			licenses: [
				license({ license_plan_id: "keep" }),
				license({ license_plan_id: "edit", included: 2 }),
			],
		});
		const to = makePlan({
			licenses: [
				license({ license_plan_id: "keep" }),
				license({ license_plan_id: "edit", included: 9 }),
			],
		});
		const reconstructed = applyDiff({
			base: from,
			diff: diffPlanV1({ from, to }),
		});
		expect(reconstructed.licenses).toEqual(to.licenses);
	});
});

describe("customizePlanV1DiffsEqual — license lanes", () => {
	test("same upserts in different order are equal", () => {
		const left: DiffedCustomizePlanV1 = {
			upsert_licenses: [
				{ license_plan_id: "seat", included: 2 },
				{ license_plan_id: "pack", included: 5 },
			],
		};
		const right: DiffedCustomizePlanV1 = {
			upsert_licenses: [
				{ license_plan_id: "pack", included: 5 },
				{ license_plan_id: "seat", included: 2 },
			],
		};
		expect(customizePlanV1DiffsEqual({ left, right })).toBe(true);
	});

	test("different included on the same upsert are not equal", () => {
		expect(
			customizePlanV1DiffsEqual({
				left: { upsert_licenses: [{ license_plan_id: "seat", included: 2 }] },
				right: { upsert_licenses: [{ license_plan_id: "seat", included: 9 }] },
			}),
		).toBe(false);
	});

	test("upsert customize null vs omitted are not equal", () => {
		expect(
			customizePlanV1DiffsEqual({
				left: {
					upsert_licenses: [{ license_plan_id: "seat", customize: null }],
				},
				right: { upsert_licenses: [{ license_plan_id: "seat" }] },
			}),
		).toBe(false);
	});

	test("upsert vs remove of the same id are not equal", () => {
		expect(
			customizePlanV1DiffsEqual({
				left: { upsert_licenses: [{ license_plan_id: "seat" }] },
				right: { remove_licenses: [{ license_plan_id: "seat" }] },
			}),
		).toBe(false);
	});
});
