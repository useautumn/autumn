import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { IdMatcherSchema, sharedWhenFields } from "./whenFields";

/** Apply reward. */
export const rewardApplyWhenShape = {
	customer: sharedWhenFields.customer,
	reward_id: IdMatcherSchema.optional(),
};

export const RewardApplyWhenSchema = buildWhenSchema({
	shape: rewardApplyWhenShape,
});
export type RewardApplyWhen = WhenOf<typeof rewardApplyWhenShape>;
