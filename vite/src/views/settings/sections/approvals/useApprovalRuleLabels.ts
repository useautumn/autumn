import {
	AppEnv,
	findFeatureById,
	getFeatureName,
	type Membership,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useRolesQuery } from "@/hooks/queries/useRolesQuery";
import { formatAmountWithCurrencyPrecision } from "@/utils/formatUtils/formatCurrencyUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import type { RuleLabels } from "./buildRuleSentence";
import { useApprovalsCatalog } from "./useApprovalsCatalog";

/** Resolves the ids a rule stores to the names the list shows, falling back to the id. */
export const useApprovalRuleLabels = (): RuleLabels => {
	const { org } = useOrg();
	const { products, features } = useApprovalsCatalog();
	const { memberships } = useMemberships();
	const { roles } = useRolesQuery();
	// Rules are live, like the catalog above.
	const { rewards } = useRewardsQuery({ env: AppEnv.Live });

	return {
		member: (userId) => {
			const member = memberships.find(
				({ user }: Membership) => user.id === userId,
			);
			return member?.user.name || member?.user.email || userId;
		},
		role: (roleId) => roles.find((role) => role.id === roleId)?.name ?? roleId,
		plan: (planId) =>
			products.find((product) => product.id === planId)?.name ?? planId,
		feature: (featureId) => {
			const feature = findFeatureById({ features, featureId });
			return {
				name: feature?.name ?? featureId,
				unit: getFeatureName({ feature, plural: true }),
			};
		},
		reward: (rewardId) =>
			rewards.find((reward) => reward.id === rewardId)?.name ?? rewardId,
		money: (amount) =>
			formatAmountWithCurrencyPrecision({
				amount,
				currency: org?.default_currency,
			}),
	};
};
