import {
	CusExpand,
	CusProductStatus,
	type CustomerData,
	type Entity,
	type EntityData,
	type FullCustomer,
} from "@autumn/shared";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { CusService } from "../CusService.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";
import {
	deleteCusCache,
	refreshCusCache,
} from "../cusCache/updateCachedCus.js";
import { handleCreateCustomer } from "../handlers/handleCreateCustomer.js";
import { updateCustomerDetails } from "./cusUtils.js";

export const getOrCreateCustomer = async ({
	req,
	customerId,
	customerData,
	inStatuses = [
		CusProductStatus.Active,
		CusProductStatus.PastDue,
		CusProductStatus.Scheduled,
	],
	skipGet = false,
	withEntities = false,
	expand,

	// Entity stuff
	entityId,
	entityData,
	withCache = false,
}: {
	req: ExtendedRequest;
	customerId: string | null;
	customerData?: CustomerData;
	inStatuses?: CusProductStatus[];
	skipGet?: boolean;
	withEntities?: boolean;
	expand?: CusExpand[];
	entityId?: string;
	entityData?: EntityData;
	withCache?: boolean;
}): Promise<FullCustomer> => {
	let customer: FullCustomer | undefined;

	const { db, org, env, logger } = req;

	if (!withEntities) {
		withEntities = expand?.includes(CusExpand.Entities) || false;
	}

	if (!skipGet && customerId) {
		if (withCache) {
			customer = await getCusWithCache({
				db,
				idOrInternalId: customerId,
				org,
				env,
				entityId,
				expand: expand as CusExpand[],
				logger,
			});
		} else {
			customer = await CusService.getFull({
				db,
				idOrInternalId: customerId,
				orgId: org.id,
				env,
				inStatuses,
				withEntities,
				entityId,
				expand,
				allowNotFound: true,
				withSubs: true,
			});
		}
	}

	if (!customer) {
		try {
			customer = (await handleCreateCustomer({
				req,
				cusData: {
					id: customerId,
					name: customerData?.name,
					email: customerData?.email,
					fingerprint: customerData?.fingerprint,
					metadata: customerData?.metadata || {},
					stripe_id: customerData?.stripe_id,
				},
			})) as FullCustomer;

			customer = await CusService.getFull({
				db,
				idOrInternalId: customerId || customer.internal_id,
				orgId: org.id,
				env,
				inStatuses,
				withEntities,
				entityId,
				expand,
				withSubs: true,
			});

			await deleteCusCache({
				db,
				customerId: customer.id || customer.internal_id,
				org,
				env,
			});
		} catch (error: any) {
			if (error?.data?.code === "23505" && customerId) {
				customer = await CusService.getFull({
					db,
					idOrInternalId: customerId,
					orgId: org.id,
					env,
					inStatuses,
					withEntities,
					entityId,
					expand,
					withSubs: true,
				});
			} else {
				throw error;
			}
		}
	}

	customer = await updateCustomerDetails({
		db,
		customer,
		customerData,
		org,
		logger,
	});

	// Customer is defined by this point!
	customer = customer as FullCustomer;

	if (entityId && !customer.entity) {
		logger.info(`Auto creating entity ${entityId} for customer ${customerId}`);

		const newEntity = (await autoCreateEntity({
			req,
			customer,
			entityId,
			entityData: {
				id: entityId,
				name: entityData?.name,
				feature_id: entityData?.feature_id || "",
			},
			logger,
		})) as Entity;

		customer.entities = [...(customer.entities || []), newEntity];
		customer.entity = newEntity;

		await refreshCusCache({
			db,
			customerId: customer.id || customer.internal_id,
			org,
			env: customer.env,
		});
	}

	return customer as FullCustomer;
};
