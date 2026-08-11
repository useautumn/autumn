import type { CheckParams, FullSubject, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCustomerData } from "@/internal/customers/actions/updateCustomerData.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { getOrCreateCachedFullSubject } from "../getOrCreateCachedFullSubject.js";
import { getCachedPartialFullSubject } from "./getCachedPartialFullSubject.js";

export const getOrCreateCachedPartialFullSubject = async ({
	ctx,
	params,
	featureIds,
	source,
	hedgePrimaryHydration = false,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	featureIds: string[];
	source?: string;
	hedgePrimaryHydration?: boolean;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache;
	const { customer_id: customerId, entity_id: entityId } = params;

	if (customerId && useRedis) {
		const { fullSubject: cached } = await getCachedPartialFullSubject({
			ctx,
			customerId,
			entityId,
			featureIds,
			source,
		});

		if (cached) {
			logger.debug(
				`[getOrCreateCachedPartialFullSubject] Cache hit: ${customerId}`,
			);
			await updateCustomerData({
				ctx,
				fullSubject: cached,
				customerData: params.customer_data,
			});
			return cached;
		}
	}

	const fullSubject = await getOrCreateCachedFullSubject({
		ctx,
		params,
		source,
		hedgePrimaryHydration,
	});

	return filterFullSubjectByFeatureIds({
		fullSubject,
		featureIds,
	});
};
