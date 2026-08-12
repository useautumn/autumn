import { describe, expect, test } from "bun:test";
import {
	type FreeTrial,
	FreeTrialDuration,
	type FreeTrialParamsV1,
} from "@autumn/shared";
import { computeFreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeFreeTrialPlan/computeFreeTrialPlan";

const currentRow = (overrides: Partial<FreeTrial> = {}): FreeTrial => ({
	id: "ft_current",
	duration: FreeTrialDuration.Day,
	length: 14,
	unique_fingerprint: false,
	created_at: 1,
	internal_product_id: "prod_1",
	is_custom: false,
	card_required: true,
	on_end: null,
	...overrides,
});

const params = (
	overrides: Partial<FreeTrialParamsV1> = {},
): FreeTrialParamsV1 => ({
	duration_length: 14,
	duration_type: FreeTrialDuration.Day,
	card_required: true,
	...overrides,
});

describe("computeFreeTrialPlan", () => {
	test("omitted params → preserve current", () => {
		const current = currentRow();
		const plan = computeFreeTrialPlan({
			freeTrialParams: undefined,
			currentFreeTrial: current,
			internalProductId: "prod_1",
		});
		expect(plan).toEqual({
			changed: false,
			new: null,
			same: current,
			retired: null,
			projected: current,
		});
	});

	test("omitted with no current → all null / same null", () => {
		const plan = computeFreeTrialPlan({
			freeTrialParams: undefined,
			currentFreeTrial: null,
			internalProductId: "prod_1",
		});
		expect(plan.changed).toBe(false);
		expect(plan.projected).toBeNull();
		expect(plan.same).toBeNull();
		expect(plan.new).toBeNull();
		expect(plan.retired).toBeNull();
	});

	test("null params → retire current, projected null", () => {
		const current = currentRow();
		const plan = computeFreeTrialPlan({
			freeTrialParams: null,
			currentFreeTrial: current,
			internalProductId: "prod_1",
		});
		expect(plan).toEqual({
			changed: true,
			new: null,
			same: null,
			retired: current,
			projected: null,
		});
	});

	test("null params with no current → unchanged", () => {
		const plan = computeFreeTrialPlan({
			freeTrialParams: null,
			currentFreeTrial: null,
			internalProductId: "prod_1",
		});
		expect(plan.changed).toBe(false);
		expect(plan.projected).toBeNull();
	});

	test("object matching current → claim same row id", () => {
		const current = currentRow();
		const plan = computeFreeTrialPlan({
			freeTrialParams: params(),
			currentFreeTrial: current,
			internalProductId: "prod_1",
		});
		expect(plan.changed).toBe(false);
		expect(plan.new).toBeNull();
		expect(plan.retired).toBeNull();
		expect(plan.same).toBe(current);
		expect(plan.projected).toBe(current);
		expect(plan.projected?.id).toBe("ft_current");
	});

	test("object differing → retire + mint; projected is new", () => {
		const current = currentRow();
		const plan = computeFreeTrialPlan({
			freeTrialParams: params({ duration_length: 30 }),
			currentFreeTrial: current,
			internalProductId: "prod_1",
		});
		expect(plan.changed).toBe(true);
		expect(plan.retired).toBe(current);
		expect(plan.same).toBeNull();
		expect(plan.new).not.toBeNull();
		expect(plan.new?.id).not.toBe("ft_current");
		expect(plan.new?.length).toBe(30);
		expect(plan.projected).toBe(plan.new);
		expect(plan.new?.internal_product_id).toBe("prod_1");
	});

	test("no current + object → new only", () => {
		const plan = computeFreeTrialPlan({
			freeTrialParams: params({ card_required: false }),
			currentFreeTrial: null,
			internalProductId: "prod_new",
		});
		expect(plan.changed).toBe(true);
		expect(plan.retired).toBeNull();
		expect(plan.same).toBeNull();
		expect(plan.new).not.toBeNull();
		expect(plan.projected).toBe(plan.new);
		expect(plan.new?.card_required).toBe(false);
		expect(plan.new?.internal_product_id).toBe("prod_new");
	});

	test("on_end bill ≡ omitted → claim same", () => {
		const current = currentRow({ on_end: null });
		const plan = computeFreeTrialPlan({
			freeTrialParams: params({ on_end: "bill" }),
			currentFreeTrial: current,
			internalProductId: "prod_1",
		});
		expect(plan.changed).toBe(false);
		expect(plan.same).toBe(current);
		expect(plan.new).toBeNull();
	});
});
