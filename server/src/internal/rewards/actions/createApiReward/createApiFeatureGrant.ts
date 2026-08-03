import {
	type CreateReward,
	type CreateRewardParams,
	type CreateRewardResponse,
	ErrCode,
	FeatureNotFoundError,
	FeatureType,
	findFeatureById,
	RecaseError,
	RewardType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiFeatureGrant } from "../../apiRewards/getApiFeatureGrant.js";
import { createReward } from "../createReward.js";

type FeatureGrantParams = Extract<
	CreateRewardParams,
	{ feature_grant: unknown }
>["feature_grant"];

const featureGrantToRewardData = ({
	ctx,
	featureGrant,
}: {
	ctx: AutumnContext;
	featureGrant: FeatureGrantParams;
}): CreateReward => ({
	id: featureGrant.id,
	name: featureGrant.name,
	type: RewardType.FeatureGrant,
	promo_codes: featureGrant.promo_codes.map(({ code, max_uses }) => ({
		code,
		global_max_redemption: max_uses ?? undefined,
	})),
	entitlements: featureGrant.grants.map((grant) => {
		const feature = findFeatureById({
			features: ctx.features,
			featureId: grant.feature_id,
		});
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: grant.feature_id });
		}
		if ((feature.type === FeatureType.Boolean) !== (grant.included === null)) {
			throw new RecaseError({
				message:
					feature.type === FeatureType.Boolean
						? `Feature ${feature.id} must have included set to null`
						: `Feature ${feature.id} must have a positive included value`,
				code: ErrCode.InvalidReward,
				statusCode: 400,
			});
		}

		return {
			internal_feature_id: feature.internal_id,
			allowance: grant.included ?? undefined,
			expiry: grant.expiry
				? { duration: grant.expiry.type, length: grant.expiry.length }
				: undefined,
		};
	}),
});

export const createApiFeatureGrant = async ({
	ctx,
	featureGrant,
}: {
	ctx: AutumnContext;
	featureGrant: FeatureGrantParams;
}): Promise<CreateRewardResponse> => {
	const rewardData = featureGrantToRewardData({ ctx, featureGrant });
	const [reward] = await createReward({ ctx, rewardData });

	return {
		feature_grant: getApiFeatureGrant({ reward, features: ctx.features }),
	};
};
