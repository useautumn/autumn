import { AppEnv, type Entity } from "@autumn/shared";

export const createMockEntity = ({
	id,
	featureId,
	internalFeatureId,
	name,
}: {
	id: string;
	featureId: string;
	internalFeatureId?: string;
	name?: string;
}): Entity => ({
	id,
	org_id: "org_test",
	created_at: Date.now(),
	internal_id: `internal_${id}`,
	internal_customer_id: "cus_internal",
	env: AppEnv.Sandbox,
	name: name ?? id,
	deleted: false,
	feature_id: featureId,
	internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
});




