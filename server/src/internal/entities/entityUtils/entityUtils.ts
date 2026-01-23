import {
	type AppEnv,
	type Entity,
	FeatureType,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";

export const constructEntity = ({
	inputEntity,
	feature,
	internalCustomerId,
	orgId,
	env,
	deleted = false,
}: {
	inputEntity: any;
	feature: any;
	internalCustomerId: string;
	orgId: string;
	env: AppEnv;
	deleted?: boolean;
}) => {
	const entity: Entity = {
		internal_id: generateId("ety"),
		id: inputEntity.id,
		name: inputEntity.name,
		internal_customer_id: internalCustomerId,
		feature_id: feature.id,
		internal_feature_id: feature.internal_id,
		org_id: orgId,
		env,
		deleted,
		created_at: Date.now(),
	};

	return entity;
};
