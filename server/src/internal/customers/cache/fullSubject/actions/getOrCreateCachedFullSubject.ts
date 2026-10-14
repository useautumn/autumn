import {
	type CheckParams,
	type FullSubject,
	fullCustomerToFullSubject,
	SubjectType,
	type TrackParams,
} from "@autumn/shared";
import type { SubjectReadFrom } from "@/db/resolveSubjectReadDb.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createCustomerWithDefaults } from "@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js";
import { updateCustomerData } from "@/internal/customers/actions/updateCustomerData.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { isReplicaSourced } from "../subjectProvenance.js";
import { usesSubjectCache } from "../usesSubjectCache.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

export const getOrCreateCachedFullSubject = async ({
	ctx,
	params,
	source,
	readFrom = "primary",
	useDelayedPostgresBackupRead = false,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	source?: string;
	readFrom?: SubjectReadFrom;
	useDelayedPostgresBackupRead?: boolean;
}): Promise<FullSubject> => {
	const { logger } = ctx;
	const useRedis = usesSubjectCache({ ctx, customerId: params.customer_id });
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
			if (ctx.subjectReadTrace) ctx.subjectReadTrace.source = "cache";
			setCache = false;
		}
	}

	if (!fullSubject && customerId) {
		normalizedResult = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId,
			allowMissingEntity: true,
			readFrom,
			routeSource: source,
			useDelayedPostgresBackupRead,
		});
		if (normalizedResult) {
			fullSubject = normalizedResult.fullSubject;
			fullSubject.subjectViewEpoch = fetchedSubjectViewEpoch;
		}
	}

	if (!fullSubject) {
		const fullCustomer = await createCustomerWithDefaults({
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
		customer: fullSubject.customer,
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
				billing_controls: entityData?.billing_controls,
			},
		});

		if (newEntity) {
			fullSubject.entity = newEntity;
			fullSubject.entityId = newEntity.id || undefined;
			fullSubject.internalEntityId = newEntity.internal_id;
			fullSubject.subjectType = SubjectType.Entity;
			setCache = true;
			normalizedResult = await getFullSubjectNormalized({
				ctx,
				customerId: fullSubject.customer.id || fullSubject.customer.internal_id,
				entityId: newEntity.id ?? entityId,
				useDelayedPostgresBackupRead,
				routeSource: source,
			});
			if (normalizedResult) {
				fullSubject = normalizedResult.fullSubject;
				fullSubject.subjectViewEpoch = fetchedSubjectViewEpoch;
			}
		}
	}

	if (useRedis && setCache) {
		if (!normalizedResult) {
			normalizedResult = await getFullSubjectNormalized({
				ctx,
				customerId: fullSubject.customer.id || fullSubject.customer.internal_id,
				entityId: fullSubject.entity?.id || entityId,
				useDelayedPostgresBackupRead,
				routeSource: source,
			});
		}

		if (normalizedResult) {
			if (!isReplicaSourced(normalizedResult.normalized)) {
				await setCachedFullSubject({
					ctx,
					normalized: normalizedResult.normalized,
					fetchedSubjectViewEpoch,
				}).catch((error) =>
					logger.error(`Failed to set full subject cache: ${error}`),
				);
			}
			fullSubject = normalizedResult.fullSubject;
			fullSubject.subjectViewEpoch = fetchedSubjectViewEpoch;
		}
	}

	return fullSubject;
};
