import type {
	AppEnv,
	CreateEntityParams,
	Entity,
	Feature,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export const constructEntity = ({
	inputEntity,
	feature,
	internalCustomerId,
	orgId,
	env,
	deleted = false,
}: {
	inputEntity: CreateEntityParams;
	feature: Feature;
	internalCustomerId: string;
	orgId: string;
	env: AppEnv;
	deleted?: boolean;
}) => {
	const entity: Entity = {
		internal_id: generateId("ety"),
		id: inputEntity.id,
		name: inputEntity.name ?? null,
		internal_customer_id: internalCustomerId,
		feature_id: feature.id,
		internal_feature_id: feature.internal_id,
		org_id: orgId,
		env,
		deleted,
		created_at: Date.now(),
		spend_limits: inputEntity.billing_controls?.spend_limits,
	};

	return entity;
};
