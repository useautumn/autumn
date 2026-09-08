import { describe, expect, test } from "bun:test";
import {
	CouponDurationType,
	RewardType,
	type UpdateCatalogParams,
} from "@autumn/shared";
import {
	computeRemoveRewardsPlan,
	computeUpsertRewardsPlan,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeRewardsPlan/computeRewardsPlan";
import type { RewardStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";

const couponState = ({
	internalId,
	id,
	value,
}: {
	internalId: string;
	id: string;
	value: number;
}) =>
	({
		internalId,
		id,
		kind: "coupon" as const,
		coupon: {
			id,
			name: "Summer Sale",
			type: RewardType.PercentageDiscount as never,
			value,
			duration: { type: CouponDurationType.Months, length: 3 },
			plan_ids: ["pro"],
			promo_codes: [
				{
					code: "SUMMER",
					global_max_redemption: null,
					first_time_transaction: false,
				},
			],
			created_at: 0,
		},
	}) satisfies RewardStatesContext["rewards"][number];

const couponParams = ({ id, value }: { id: string; value: number }) => ({
	coupon: {
		id,
		name: "Summer Sale",
		type: RewardType.PercentageDiscount as never,
		value,
		duration: { type: CouponDurationType.Months, length: 3 },
		plan_ids: ["pro"],
		promo_codes: [{ code: "SUMMER" }],
	},
});

const paramsWith = (
	overrides: Partial<UpdateCatalogParams>,
): UpdateCatalogParams =>
	({
		remove_features: [],
		remove_plans: [],
		skip_deletions: true,
		skip_version_deletions: true,
		skip_plan_ids: [],
		skip_feature_ids: [],
		...overrides,
	}) as UpdateCatalogParams;

const context = (
	overrides: Partial<RewardStatesContext> = {},
): RewardStatesContext => ({
	rewards: [],
	unstatableIds: new Set(),
	programs: [],
	...overrides,
});

describe("catalogV2 reward compute", () => {
	test("an unchanged coupon is a none, a changed one carries its previous value", () => {
		const rewardStatesContext = context({
			rewards: [couponState({ internalId: "rw_1", id: "sale", value: 20 })],
		});

		const unchanged = computeUpsertRewardsPlan({
			params: paramsWith({
				rewards: [couponParams({ id: "sale", value: 20 })],
			}),
			rewardStatesContext,
		});
		expect(unchanged[0]?.previousAttributes).toBeNull();
		expect(unchanged[0]?.internalId).toBe("rw_1");

		const changed = computeUpsertRewardsPlan({
			params: paramsWith({
				rewards: [couponParams({ id: "sale", value: 35 })],
			}),
			rewardStatesContext,
		});
		expect(changed[0]?.previousAttributes).toEqual({ value: 20 });
	});

	test("a reward the config never states is removed only under full state", () => {
		const rewardStatesContext = context({
			rewards: [couponState({ internalId: "rw_1", id: "sale", value: 20 })],
		});

		expect(
			computeRemoveRewardsPlan({
				params: paramsWith({ rewards: [], skip_deletions: true }),
				rewardStatesContext,
			}),
		).toEqual([]);

		const removed = computeRemoveRewardsPlan({
			params: paramsWith({ rewards: [], skip_deletions: false }),
			rewardStatesContext,
		});
		expect(removed.map((plan) => plan.rewardId)).toEqual(["sale"]);
	});

	test("a payload that never mentions rewards removes none of them", () => {
		expect(
			computeRemoveRewardsPlan({
				params: paramsWith({ skip_deletions: false }),
				rewardStatesContext: context({
					rewards: [couponState({ internalId: "rw_1", id: "sale", value: 20 })],
				}),
			}),
		).toEqual([]);
	});
});
