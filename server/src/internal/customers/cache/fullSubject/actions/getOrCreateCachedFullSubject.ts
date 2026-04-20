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
import { getOrInitFullSubjectViewEpoch } from "./invalidate/getOrInitFullSubjectViewEpoch.js";
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

	if (customerId && !skipCache) {
		fullSubject = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
		});

		if (fullSubject) {
			logger.debug(`[getOrCreateCachedFullSubject] Cache hit: ${customerId}`);
			setCache = false;
		}
	}

	if (!fullSubject && customerId) {
		fetchedSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
			ctx,
			customerId,
		});
		normalizedResult = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId,
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

	if (!skipCache && setCache) {
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
