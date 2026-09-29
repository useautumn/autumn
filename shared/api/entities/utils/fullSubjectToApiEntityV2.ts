import {
	type ApiEntityV2,
	type EntityLegacyData,
	type FullSubject,
	getApiEntityBaseV2,
	type SharedContext,
} from "@autumn/shared";

/** entities.get's body before expands and version changes: internal fields stripped. */
export const fullSubjectToApiEntityV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: SharedContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<{ apiEntity: ApiEntityV2; legacyData: EntityLegacyData }> => {
	const { apiEntity: baseEntity, legacyData } = await getApiEntityBaseV2({
		ctx,
		fullSubject,
		withAutumnId,
	});

	return {
		apiEntity: {
			...baseEntity,
			feature_id: baseEntity.feature_id || undefined,
			autumn_id: withAutumnId ? baseEntity.autumn_id : undefined,
		},
		legacyData,
	};
};
