import {
	AffectedResource,
	type ApiEntityV2,
	applyResponseVersionChanges,
	type FullSubject,
	fullSubjectToApiEntityV2,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiEntityExpand } from "../apiEntityUtils/getApiEntityExpand.js";

export const getApiEntityV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<ApiEntityV2> => {
	const { apiEntity: cleanedBaseEntity, legacyData } =
		await fullSubjectToApiEntityV2({ ctx, fullSubject, withAutumnId });

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
