import {
	findFeatureById,
	getFeatureName,
	type Membership,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { formatAmountWithCurrencyPrecision } from "@/utils/formatUtils/formatCurrencyUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import type { RuleLabels } from "./buildRuleSentence";

/** Resolves the ids a rule stores to the names the list shows, falling back to the id. */
export const useApprovalRuleLabels = (): RuleLabels => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const { memberships } = useMemberships();
	const { rewards } = useRewardsQuery();

	return {
		member: (userId) => {
			const member = memberships.find(
				({ user }: Membership) => user.id === userId,
			);
			return member?.user.name || member?.user.email || userId;
		},
		plan: (planId) =>
			products.find((product) => product.id === planId)?.name ?? planId,
		feature: (featureId) => {
			const feature = findFeatureById({ features, featureId });
			return {
				name: feature?.name ?? featureId,
				unit: getFeatureName({ feature, plural: true }),
			};
		},
		money: (amount) =>
			formatAmountWithCurrencyPrecision({
				amount,
				currency: org?.default_currency,
			}),
		reward: (rewardId) =>
			rewards.find((reward) => reward.id === rewardId)?.name || rewardId,
	};
};
