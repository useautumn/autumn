import { usesSubjectCache } from "../../usesSubjectCache.js";
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
	useDelayedPostgresBackupRead = false,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	featureIds: string[];
	source?: string;
	useDelayedPostgresBackupRead?: boolean;
}): Promise<FullSubject> => {
	const { logger } = ctx;
	const { customer_id: customerId, entity_id: entityId } = params;
	const useRedis = usesSubjectCache({ ctx, customerId });

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
				customer: cached.customer,
				customerData: params.customer_data,
			});
			return cached;
		}
	}

	const fullSubject = await getOrCreateCachedFullSubject({
		ctx,
		params,
		source,
		useDelayedPostgresBackupRead,
	});

	return filterFullSubjectByFeatureIds({
		fullSubject,
		featureIds,
	});
};
