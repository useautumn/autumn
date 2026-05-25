/**
 * Tests for `getItemId` — the single source of truth for plan-editor item
 * identity. Two regressions to protect against here:
 *
 * 1. Same `feature_id` with different intervals must produce DISTINCT ids
 *    (this turn's bug — the per-item edit sheet retargeted the wrong row).
 * 2. Item identity must NOT depend on list position. Charlie's earlier fixes
 *    (commits 709e1fd23 + 5ee6eeb3a) replaced index-based ids with stable,
 *    item-intrinsic ids to prevent React from reusing DOM rows on delete
 *    ("ghost item" bug). The new id format must still be position-invariant.
 */

import { describe, expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { getItemId } from "@/utils/product/productItemUtils";

const make = (overrides: Partial<ProductItem>): ProductItem =>
	({
		feature_id: undefined,
		entitlement_id: undefined,
		price_id: undefined,
		entity_feature_id: undefined,
		interval: undefined,
		interval_count: undefined,
		...overrides,
	}) as ProductItem;

describe("getItemId — interval discriminator (turn fix)", () => {
	test("two items with same feature_id but different intervals get distinct ids", () => {
		const monthly = make({ feature_id: "action1", interval: "month" });
		const oneOff = make({ feature_id: "action1", interval: undefined });

		const monthlyId = getItemId({ item: monthly, itemIndex: 0 });
		const oneOffId = getItemId({ item: oneOff, itemIndex: 1 });

		expect(monthlyId).not.toBe(oneOffId);
		expect(monthlyId).toBe("feature-action1-month");
		expect(oneOffId).toBe("feature-action1-oneoff");
	});

	test("same feature_id + same interval but different interval_count get distinct ids", () => {
		const oneMonth = make({
			feature_id: "action1",
			interval: "month",
			interval_count: 1,
		});
		const threeMonths = make({
			feature_id: "action1",
			interval: "month",
			interval_count: 3,
		});

		const a = getItemId({ item: oneMonth, itemIndex: 0 });
		const b = getItemId({ item: threeMonths, itemIndex: 1 });

		expect(a).not.toBe(b);
		expect(a).toBe("feature-action1-month"); // count=1 is implicit
		expect(b).toBe("feature-action1-monthx3");
	});

	test("entity-scoped feature items still get distinct ids per interval", () => {
		const monthly = make({
			feature_id: "seats",
			entity_feature_id: "team",
			interval: "month",
		});
		const oneOff = make({
			feature_id: "seats",
			entity_feature_id: "team",
			interval: undefined,
		});

		expect(getItemId({ item: monthly, itemIndex: 0 })).toBe(
			"feature-seats-team-month",
		);
		expect(getItemId({ item: oneOff, itemIndex: 1 })).toBe(
			"feature-seats-team-oneoff",
		);
	});

	test("entitlement-keyed items also discriminate by interval", () => {
		const monthly = make({ entitlement_id: "ent_x", interval: "month" });
		const oneOff = make({ entitlement_id: "ent_x", interval: undefined });

		expect(getItemId({ item: monthly, itemIndex: 0 })).toBe(
			"ent-ent_x-month",
		);
		expect(getItemId({ item: oneOff, itemIndex: 1 })).toBe("ent-ent_x-oneoff");
	});

	test("price-keyed items also discriminate by interval", () => {
		const monthly = make({ price_id: "pr_x", interval: "month" });
		const oneOff = make({ price_id: "pr_x", interval: undefined });

		expect(getItemId({ item: monthly, itemIndex: 0 })).toBe("price-pr_x-month");
		expect(getItemId({ item: oneOff, itemIndex: 1 })).toBe("price-pr_x-oneoff");
	});
});

describe("getItemId — position-invariance (Charlie's earlier fix)", () => {
	test("feature-based id does not depend on itemIndex", () => {
		const item = make({ feature_id: "action1", interval: "month" });
		expect(getItemId({ item, itemIndex: 0 })).toBe(
			getItemId({ item, itemIndex: 5 }),
		);
	});

	test("entitlement-based id does not depend on itemIndex", () => {
		const item = make({ entitlement_id: "ent_x", interval: "month" });
		expect(getItemId({ item, itemIndex: 0 })).toBe(
			getItemId({ item, itemIndex: 9 }),
		);
	});

	test("price-based id does not depend on itemIndex", () => {
		const item = make({ price_id: "pr_x", interval: "month" });
		expect(getItemId({ item, itemIndex: 0 })).toBe(
			getItemId({ item, itemIndex: 9 }),
		);
	});

	test("deleting a sibling does not change other items' ids", () => {
		// Simulates the ghost-item scenario: build a list, drop an item from
		// the middle, and verify the remaining items still hash to their
		// original ids (which is what prevents React from reusing DOM rows).
		const items = [
			make({ feature_id: "messages", interval: "month" }),
			make({ feature_id: "to-be-deleted", interval: "month" }),
			make({ feature_id: "seats", interval: undefined }),
		];
		const idsBefore = items.map((item, i) =>
			getItemId({ item, itemIndex: i }),
		);

		const afterDelete = items.filter((_, i) => i !== 1);
		const idsAfter = afterDelete.map((item, i) =>
			getItemId({ item, itemIndex: i }),
		);

		expect(idsAfter).toEqual([idsBefore[0]!, idsBefore[2]!]);
	});

	test("index-only fallback fires only when no identifying ids are present", () => {
		const orphan = make({ interval: "month" });
		expect(getItemId({ item: orphan, itemIndex: 7 })).toBe("item-7");
	});
});

describe("getItemId — branch precedence", () => {
	test("entitlement_id wins over price_id and feature_id", () => {
		const item = make({
			entitlement_id: "ent_x",
			price_id: "pr_x",
			feature_id: "action1",
			interval: "month",
		});
		expect(getItemId({ item, itemIndex: 0 })).toBe("ent-ent_x-month");
	});

	test("price_id wins over feature_id when no entitlement_id", () => {
		const item = make({
			price_id: "pr_x",
			feature_id: "action1",
			interval: "month",
		});
		expect(getItemId({ item, itemIndex: 0 })).toBe("price-pr_x-month");
	});
});
