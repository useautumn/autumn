import {
	AffectedResource,
	type ApiEntityV2,
	applyResponseVersionChanges,
	type FullSubject,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiEntityExpand } from "../apiEntityUtils/getApiEntityExpand.js";
import { getApiEntityBaseV2 } from "./getApiEntityBaseV2.js";

export const getApiEntityV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<ApiEntityV2> => {
	const { apiEntity: baseEntity, legacyData } = await getApiEntityBaseV2({
		ctx,
		fullSubject,
		withAutumnId,
	});

	const cleanedBaseEntity: ApiEntityV2 = {
		...baseEntity,
		feature_id: baseEntity.feature_id || undefined,
		autumn_id: withAutumnId ? baseEntity.autumn_id : undefined,
	};

	const apiEntityExpand = await getApiEntityExpand({
		ctx,
		customerId: fullSubject.customer.id || fullSubject.customer.internal_id,
		entityId:
			fullSubject.entity?.id ||
			fullSubject.entity?.internal_id ||
			fullSubject.entityId,
	});

	const apiEntity: ApiEntityV2 = {
		...cleanedBaseEntity,
		...apiEntityExpand,
	};

	return applyResponseVersionChanges<ApiEntityV2>({
		input: apiEntity,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Entity,
		legacyData,
		ctx,
	});
};
