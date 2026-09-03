/**
 * Contract: batch transition replaces RESET usage by default — the balance patch
 * is `set toGranted` unless the feature is carried. A feature carries when:
 * - carryOverUsages.enabled and the feature is listed (or no feature_ids filter), or
 * - the feature is allocated (continuous_use) — allocated usage always carries, or
 * - the incoming entitlement has carry_from_previous set.
 * Carried patches keep today's increment-by-delta math. Boolean/unlimited
 * boundary behavior and pooled delta routing are unchanged.
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	type CarryOverUsages,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { computeCustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch";

const NOW = 1_700_000_000_000;

const feature = ({
	id,
	type = FeatureType.Metered,
	usageType = FeatureUsageType.Single,
}: {
	id: string;
	type?: FeatureType;
	usageType?: FeatureUsageType;
}) => ({
	internal_id: `internal_${id}`,
	org_id: "org_test",
	created_at: NOW,
	env: "sandbox",
	id,
	name: id,
	type,
	config: type === FeatureType.Boolean ? null : { usage_type: usageType },
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
});

const entitlement = ({
	id,
	feature: entFeature,
	allowance,
	allowanceType = AllowanceType.Fixed,
	carryFromPrevious = false,
}: {
	id: string;
	feature: ReturnType<typeof feature>;
	allowance?: number | null;
	allowanceType?: AllowanceType;
	carryFromPrevious?: boolean;
}): EntitlementWithFeature =>
	({
		id,
		created_at: NOW,
		internal_feature_id: entFeature.internal_id,
		internal_product_id: "product_test",
		internal_reward_id: null,
		is_custom: false,
		allowance_type:
			entFeature.type === FeatureType.Boolean
				? AllowanceType.None
				: allowanceType,
		allowance: allowance ?? null,
		interval:
			entFeature.type === FeatureType.Boolean ? null : EntInterval.Month,
		interval_count: 1,
		carry_from_previous: carryFromPrevious,
		entity_feature_id: null,
		usage_limit: null,
		feature: entFeature,
	}) as EntitlementWithFeature;

const messages = feature({ id: "messages" });
const workflows = feature({
	id: "workflows",
	usageType: FeatureUsageType.Continuous,
});
const admin = feature({ id: "admin", type: FeatureType.Boolean });

const meteredPair = ({
	fromAllowance,
	toAllowance,
	withFeature = messages,
}: {
	fromAllowance: number;
	toAllowance: number;
	withFeature?: ReturnType<typeof feature>;
}) => ({
	fromEntitlement: entitlement({
		id: "ent_from",
		feature: withFeature,
		allowance: fromAllowance,
	}),
	toEntitlement: entitlement({
		id: "ent_to",
		feature: withFeature,
		allowance: toAllowance,
	}),
});

const carryAll: CarryOverUsages = { enabled: true };
const carryNone: CarryOverUsages = { enabled: false };

describe("computeCustomerEntitlementPatch", () => {
	// u1
	test("default (no carry config) resets the balance to the new grant", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 500 }),
		});
		expect(patch.balance).toEqual({ type: "set", amount: 500 });
	});

	// u2
	test("carryOverUsages disabled resets the balance to the new grant", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 500 }),
			carryOverUsages: carryNone,
		});
		expect(patch.balance).toEqual({ type: "set", amount: 500 });
	});

	// u3
	test("carryOverUsages enabled increments by the allowance delta", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 500 }),
			carryOverUsages: carryAll,
		});
		expect(patch.balance).toEqual({ type: "increment", amount: 400 });
	});

	// u4
	test("feature_ids excluding the feature resets the balance", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 500 }),
			carryOverUsages: { enabled: true, feature_ids: ["words"] },
		});
		expect(patch.balance).toEqual({ type: "set", amount: 500 });
	});

	// u5
	test("feature_ids including the feature carries the usage", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 500 }),
			carryOverUsages: { enabled: true, feature_ids: ["messages"] },
		});
		expect(patch.balance).toEqual({ type: "increment", amount: 400 });
	});

	// u6
	test("equal allowances still reset by default — usage clears", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 100 }),
		});
		expect(patch.balance).toEqual({ type: "set", amount: 100 });
	});

	// u7
	test("equal allowances with carry enabled emit no balance patch", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({ fromAllowance: 100, toAllowance: 100 }),
			carryOverUsages: carryAll,
		});
		expect(patch.balance).toBeUndefined();
	});

	// u8
	test("allocated (continuous_use) features always carry, even by default", () => {
		const patch = computeCustomerEntitlementPatch({
			...meteredPair({
				fromAllowance: 100,
				toAllowance: 500,
				withFeature: workflows,
			}),
		});
		expect(patch.balance).toEqual({ type: "increment", amount: 400 });
	});

	// u9
	test("incoming carry_from_previous entitlement carries by default", () => {
		const patch = computeCustomerEntitlementPatch({
			fromEntitlement: entitlement({
				id: "ent_from",
				feature: messages,
				allowance: 100,
			}),
			toEntitlement: entitlement({
				id: "ent_to",
				feature: messages,
				allowance: 500,
				carryFromPrevious: true,
			}),
		});
		expect(patch.balance).toEqual({ type: "increment", amount: 400 });
	});

	// u10
	test("unlimited -> metered boundary sets the new grant regardless of carry", () => {
		const fromEntitlement = entitlement({
			id: "ent_from",
			feature: messages,
			allowanceType: AllowanceType.Unlimited,
		});
		const toEntitlement = entitlement({
			id: "ent_to",
			feature: messages,
			allowance: 500,
		});
		for (const carryOverUsages of [undefined, carryAll, carryNone]) {
			const patch = computeCustomerEntitlementPatch({
				fromEntitlement,
				toEntitlement,
				carryOverUsages,
			});
			expect(patch.balance).toEqual({ type: "set", amount: 500 });
			expect(patch.unlimited).toBe(false);
		}
	});

	// u11
	test("boolean entitlements never receive a patch", () => {
		const patch = computeCustomerEntitlementPatch({
			fromEntitlement: entitlement({ id: "ent_from", feature: admin }),
			toEntitlement: entitlement({ id: "ent_to", feature: admin }),
		});
		expect(patch).toEqual({});
	});
});
