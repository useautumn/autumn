import dotenv from "dotenv";

dotenv.config();

import { AppEnv, FeatureUsageType } from "@autumn/shared";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";

export enum TestFeature {
	Dashboard = "dashboard", // boolean feature
	Messages = "messages", // single use (prepaid)
	Users = "users", // cont use
	Admin = "admin", // cont use
	AdminRights = "admin_rights", // cont use
	Words = "words", // single use (pay per use)

	Action1 = "action1", // single use (pay per use)
	Action2 = "action2", // single use (pay per use)
	Credits = "credits", // credit system
}

export const getFeatures = ({ orgId }: { orgId: string }) => ({
	[TestFeature.Dashboard]: constructBooleanFeature({
		featureId: TestFeature.Dashboard,
		orgId,
		env: AppEnv.Sandbox,
	}),
	[TestFeature.AdminRights]: constructBooleanFeature({
		featureId: TestFeature.AdminRights,
		orgId,
		env: AppEnv.Sandbox,
	}),
	[TestFeature.Messages]: constructMeteredFeature({
		featureId: TestFeature.Messages,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Single,
	}),
	[TestFeature.Admin]: constructMeteredFeature({
		featureId: TestFeature.Admin,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Continuous,
	}),
	[TestFeature.Users]: constructMeteredFeature({
		featureId: TestFeature.Users,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Continuous,
	}),
	[TestFeature.Words]: constructMeteredFeature({
		featureId: TestFeature.Words,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Single,
	}),
	[TestFeature.Action1]: constructMeteredFeature({
		featureId: TestFeature.Action1,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Single,
	}),
	[TestFeature.Action2]: constructMeteredFeature({
		featureId: TestFeature.Action2,
		orgId,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Single,
	}),
	[TestFeature.Credits]: constructCreditSystem({
		featureId: TestFeature.Credits,
		orgId,
		env: AppEnv.Sandbox,
		schema: [
			{
				metered_feature_id: TestFeature.Action1,
				credit_cost: 0.2,
			},
			{
				metered_feature_id: TestFeature.Action2,
				credit_cost: 0.6,
			},
		],
	}),
});
