import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import {
	customerEntitlementPatchKey,
	groupFilterReplaceRows,
} from "@/internal/migrations/v2/batchOperations/actions/utils/groupFilterReplaceRows.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const messagesEnt = ({
	id,
	allowance,
}: {
	id: string;
	allowance: number;
}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_pro",
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		rollover: null,
		entity_feature_id: null,
		pooled: false,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

describe("customerEntitlementPatchKey", () => {
	test("empty patch is keep on both columns", () => {
		expect(customerEntitlementPatchKey({ patch: {} })).toBe(
			"balance:keep|unlimited:keep",
		);
	});

	test("increment encodes type and amount", () => {
		expect(
			customerEntitlementPatchKey({
				patch: { balance: { type: "increment", amount: 20 } },
			}),
		).toBe("balance:increment:20|unlimited:keep");
	});

	test("set encodes type and amount", () => {
		expect(
			customerEntitlementPatchKey({
				patch: { balance: { type: "set", amount: 30 } },
			}),
		).toBe("balance:set:30|unlimited:keep");
	});

	test("unlimited null is distinct from keep", () => {
		expect(customerEntitlementPatchKey({ patch: { unlimited: null } })).toBe(
			"balance:keep|unlimited:null",
		);
		expect(customerEntitlementPatchKey({ patch: {} })).not.toBe(
			customerEntitlementPatchKey({ patch: { unlimited: null } }),
		);
	});

	test("unlimited true and false are distinct from keep and null", () => {
		const keep = customerEntitlementPatchKey({ patch: {} });
		const asNull = customerEntitlementPatchKey({ patch: { unlimited: null } });
		const asTrue = customerEntitlementPatchKey({ patch: { unlimited: true } });
		const asFalse = customerEntitlementPatchKey({
			patch: { unlimited: false },
		});

		expect(asTrue).toBe("balance:keep|unlimited:true");
		expect(asFalse).toBe("balance:keep|unlimited:false");
		expect(new Set([keep, asNull, asTrue, asFalse]).size).toBe(4);
	});
});

describe("groupFilterReplaceRows", () => {
	test("two 10/mo defs with different ids share one increment:20 group", () => {
		const to = messagesEnt({ id: "ent_minted_30", allowance: 30 });
		const groups = groupFilterReplaceRows({
			rows: [
				{ liveDefinition: messagesEnt({ id: "ent_custom_a", allowance: 10 }) },
				{ liveDefinition: messagesEnt({ id: "ent_custom_b", allowance: 10 }) },
			],
			toEntitlement: to,
		});

		expect(groups).toHaveLength(1);
		expect(customerEntitlementPatchKey({ patch: groups[0].patch })).toBe(
			"balance:increment:20|unlimited:keep",
		);
		expect(groups[0].rows).toHaveLength(2);
		expect(groups[0].rows.map((row) => row.liveDefinition?.id)).toEqual([
			"ent_custom_a",
			"ent_custom_b",
		]);
	});

	test("two 100/mo defs with different ids share one increment:-70 group", () => {
		const to = messagesEnt({ id: "ent_minted_30", allowance: 30 });
		const groups = groupFilterReplaceRows({
			rows: [
				{ liveDefinition: messagesEnt({ id: "ent_custom_a", allowance: 100 }) },
				{ liveDefinition: messagesEnt({ id: "ent_custom_b", allowance: 100 }) },
			],
			toEntitlement: to,
		});

		expect(groups).toHaveLength(1);
		expect(customerEntitlementPatchKey({ patch: groups[0].patch })).toBe(
			"balance:increment:-70|unlimited:keep",
		);
		expect(groups[0].rows).toHaveLength(2);
		expect(groups[0].rows.map((row) => row.liveDefinition?.id)).toEqual([
			"ent_custom_a",
			"ent_custom_b",
		]);
	});

	test("same-allowance different ids stay one group; a different allowance splits", () => {
		const to = messagesEnt({ id: "ent_minted_30", allowance: 30 });
		const groups = groupFilterReplaceRows({
			rows: [
				{ liveDefinition: messagesEnt({ id: "ent_100_a", allowance: 100 }) },
				{ liveDefinition: messagesEnt({ id: "ent_100_b", allowance: 100 }) },
				{ liveDefinition: messagesEnt({ id: "ent_10", allowance: 10 }) },
			],
			toEntitlement: to,
		});

		expect(groups).toHaveLength(2);
		const groupedByKey = new Map(
			groups.map((group) => [
				customerEntitlementPatchKey({ patch: group.patch }),
				group.rows.map((row) => row.liveDefinition?.id),
			]),
		);
		expect(groupedByKey.get("balance:increment:-70|unlimited:keep")).toEqual([
			"ent_100_a",
			"ent_100_b",
		]);
		expect(groupedByKey.get("balance:increment:20|unlimited:keep")).toEqual([
			"ent_10",
		]);
	});

	test("different live allowances split into separate groups", () => {
		const to = messagesEnt({ id: "ent_minted_30", allowance: 30 });
		const groups = groupFilterReplaceRows({
			rows: [
				{ liveDefinition: messagesEnt({ id: "ent_100", allowance: 100 }) },
				{ liveDefinition: messagesEnt({ id: "ent_10", allowance: 10 }) },
			],
			toEntitlement: to,
		});

		expect(groups).toHaveLength(2);
		expect(
			new Set(
				groups.map((group) => customerEntitlementPatchKey({ patch: group.patch })),
			).size,
		).toBe(2);
	});

	test("already on minted id is omitted, not grouped", () => {
		const to = messagesEnt({ id: "ent_minted_30", allowance: 30 });
		const groups = groupFilterReplaceRows({
			rows: [
				{ liveDefinition: to },
				{ liveDefinition: messagesEnt({ id: "ent_custom", allowance: 10 }) },
			],
			toEntitlement: to,
		});

		expect(groups).toHaveLength(1);
		expect(groups[0].rows).toHaveLength(1);
		expect(groups[0].rows[0].liveDefinition?.id).toBe("ent_custom");
	});
});
