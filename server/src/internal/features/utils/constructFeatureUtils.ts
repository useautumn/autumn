import {
	type AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { generateId, keyToTitle } from "@/utils/genUtils.js";

export const constructFeature = ({
	id,
	name,
	orgId,
	type,
	env,
	config,
	display,
}: {
	id: string;
	name: string;
	orgId: string;
	type: FeatureType;
	env: AppEnv;
	config: any;
	display: any;
}) => {
	const newFeature: Feature = {
		internal_id: generateId("fe"),
		id,
		name,
		org_id: orgId,
		env,
		created_at: Date.now(),
		type,
		config,
		display,
		archived: false,
		event_names: [],
		usage_type: null,
	};

	return newFeature;
};

export const constructBooleanFeature = ({
	featureId,
	orgId,
	env,
	name,
}: {
	featureId: string;
	orgId: string;
	env: AppEnv;
	name?: string;
}) => {
	const newFeature: Feature = {
		internal_id: generateId("fe"),
		org_id: orgId,
		env,
		created_at: Date.now(),

		id: featureId,
		name: name || keyToTitle(featureId),
		type: FeatureType.Boolean,
		event_names: [],
		usage_type: null,
		config: null,
		archived: false,
	};

	return newFeature;
};

export const constructMeteredFeature = ({
	featureId,
	name,
	orgId,
	env,
	usageType,
}: {
	featureId: string;
	name?: string;
	orgId: string;
	env: AppEnv;
	usageType: FeatureUsageType;
}) => {
	const newFeature: Feature = {
		internal_id: generateId("fe"),
		org_id: orgId,
		env,
		created_at: Date.now(),

		id: featureId,
		name: name || keyToTitle(featureId),
		type: FeatureType.Metered,
		usage_type: usageType,
		event_names: [],
		config: {
			// filters: [
			// 	{
			// 		property: "event_name",
			// 		operator: "eq",
			// 		value: [],
			// 	},
			// ],
			// aggregate: {
			// 	type: AggregateType.Sum,
			// 	property: "value",
			// },
		},
		archived: false,
	};

	return newFeature;
};

export const constructCreditSystem = ({
	featureId,
	name,
	orgId,
	env,
	schema,
}: {
	featureId: string;
	name?: string;
	orgId: string;
	env: AppEnv;
	schema: {
		metered_feature_id: string;
		credit_cost: number;
	}[];
}) => {
	const config = {
		schema: schema.map((item) => ({
			feature_amount: 1,
			metered_feature_id: item.metered_feature_id,
			credit_amount: item.credit_cost,
		})),
	};

	const newFeature: Feature = {
		internal_id: generateId("fe"),
		org_id: orgId,
		env,
		created_at: Date.now(),

		id: featureId,
		name: name || keyToTitle(featureId),
		type: FeatureType.CreditSystem,
		usage_type: FeatureUsageType.SingleUse,
		config,
		archived: false,
		event_names: [],
	};

	return newFeature;
};
