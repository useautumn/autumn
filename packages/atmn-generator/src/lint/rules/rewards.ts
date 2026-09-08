import type { LintRule } from "../runtime/lintDocument";
import { exists, unique } from "./define";

const REWARD_ID_PATHS = ["coupon.id", "featureGrant.id"] as const;

export const rewardRules: LintRule[] = [
	unique({
		field: REWARD_ID_PATHS,
		because: "Two rewards claiming one id race to define the same row.",
	}),
	unique({
		field: ["coupon.internalId", "featureGrant.internalId"],
		because:
			"A stable id names exactly one row; two fixtures cannot both be it.",
	}),
];

export const couponRules: LintRule[] = [
	exists({
		field: "planIds",
		in: "plans",
		matching: "planId",
		because: "A coupon discounts a plan this config does not declare.",
	}),
];

export const featureGrantGrantRules: LintRule[] = [
	exists({
		field: "featureId",
		in: "features",
		matching: "featureId",
		because: "A feature grant awards a feature this config does not declare.",
	}),
];

export const referralProgramRules: LintRule[] = [
	unique({
		field: "id",
		because:
			"Two referral programs claiming one id race to define the same row.",
	}),
	unique({
		field: "internalId",
		because:
			"A stable id names exactly one row; two fixtures cannot both be it.",
	}),
	exists({
		field: "rewardId",
		in: "rewards",
		matching: REWARD_ID_PATHS,
		because: "A referral program grants a reward this config does not declare.",
	}),
	exists({
		field: "planIds",
		in: "plans",
		matching: "planId",
		because:
			"A referral program triggers on checkout of a plan this config does not declare.",
	}),
];
