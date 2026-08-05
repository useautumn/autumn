export type RewardDuration = {
	type: "one_off" | "months" | "forever";
	length?: number;
};

export type CouponReward = {
	id: string;
	name: string;
	type: "percentage_discount" | "fixed_discount";
	value: number;
	duration: RewardDuration;
	planIds?: string[];
	promoCodes?: Array<{
		code: string;
		maxRedemptions?: number;
		firstTimeTransaction?: boolean;
	}>;
	readonly __atmnType?: "reward";
};

export type FeatureGrantReward = {
	id: string;
	name: string;
	type: "feature_grant";
	grants: Array<{
		featureId: string;
		included?: number;
		expiry?: {
			type: "hour" | "day" | "week" | "month" | "year";
			length: number;
		};
	}>;
	promoCodes: Array<{ code: string; maxUses?: number }>;
	readonly __atmnType?: "reward";
};

export type Reward = CouponReward | FeatureGrantReward;

export type ReferralProgram = {
	id: string;
	rewardId: string;
	redeemOn: "customer_creation" | "checkout";
	receivedBy: "referrer" | "all";
	maxRedemptions?: number;
	planIds?: string[];
	excludeTrial?: boolean;
	readonly __atmnType?: "referral_program";
};
