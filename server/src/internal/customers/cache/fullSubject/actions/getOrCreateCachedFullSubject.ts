import {
	type CheckParams,
	type FullSubject,
	fullCustomerToFullSubject,
	SubjectType,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { updateCustomerData } from "@/internal/customers/actions/updateCustomerData.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

export const getOrCreateCachedFullSubject = async ({
	ctx,
	params,
	source,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	source?: string;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache;
	const {
		customer_id: customerId,
		customer_data: customerData,
		entity_id: entityId,
		entity_data: entityData,
	} = params;

	let fullSubject: FullSubject | undefined;
	let normalizedResult: Awaited<ReturnType<typeof getFullSubjectNormalized>>;
	let setCache = true;
	let fetchedSubjectViewEpoch = 0;

	if (customerId && useRedis) {
		// Pipeline inside getCachedFullSubject already fetches the epoch,
		// so we reuse it on miss instead of a second round trip.
		const cachedResult = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
		});
		fullSubject = cachedResult.fullSubject;
		fetchedSubjectViewEpoch = cachedResult.subjectViewEpoch;

		if (fullSubject) {
			logger.debug(`[getOrCreateCachedFullSubject] Cache hit: ${customerId}`);
			setCache = false;
		}
	}

	if (!fullSubject && customerId) {
		// Probe customer with entity fallback: if the customer exists but the
		// requested entity doesn't, return a customer-scoped subject so the
		// downstream autoCreateEntity branch handles the missing entity
		// (either creating it when entity_data.feature_id is set, or throwing
		// the descriptive error). This prevents falling through to
		// createWithDefaults on an already-existing customer.
		normalizedResult = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId,
			allowMissingEntity: true,
		});
		if (normalizedResult) {
			fullSubject = normalizedResult.fullSubject;
		}
	}

	if (!fullSubject) {
		const fullCustomer = await customerActions.createWithDefaults({
			ctx,
			customerId,
			customerData,
		});

		fullSubject = fullCustomerToFullSubject({
			fullCustomer,
		});
	}

	const customerDataUpdated = await updateCustomerData({
		ctx,
		fullSubject,
		customerData,
	});

	if (customerDataUpdated && normalizedResult) {
		normalizedResult.normalized.customer = fullSubject.customer;
		normalizedResult.fullSubject.customer = fullSubject.customer;
	}

	if (entityId && !fullSubject.entity) {
		const newEntity = await autoCreateEntity({
			ctx,
			customerId: fullSubject.customer.id || fullSubject.customer.internal_id,
			entityId,
			entityData: {
				name: entityData?.name,
				feature_id: entityData?.feature_id || "",
			},
		});

		if (newEntity) {
			fullSubject.entity = newEntity;
			fullSubject.entityId = newEntity.id || undefined;
			fullSubject.internalEntityId = newEntity.internal_id;
			fullSubject.subjectType = SubjectType.Entity;
			setCache = true;
		}
	}

	if (useRedis && setCache) {
		if (!normalizedResult) {
			normalizedResult = await getFullSubjectNormalized({
				ctx,
				customerId: fullSubject.customer.id || fullSubject.customer.internal_id,
				entityId: fullSubject.entity?.id || entityId,
			});
		}

		if (normalizedResult) {
			await setCachedFullSubject({
				ctx,
				normalized: normalizedResult.normalized,
				fetchedSubjectViewEpoch,
			}).catch((error) =>
				logger.error(`Failed to set full subject cache: ${error}`),
			);
			fullSubject = normalizedResult.fullSubject;
		}
	}

	return fullSubject;
};
