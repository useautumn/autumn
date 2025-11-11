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
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusService } from "../CusService.js";
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
					// default_product_id: customerData?.default_product_id,
				},
				createDefaultProducts: customerData?.disable_default !== true,
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

	const updated = await updateCustomerDetails({
		ctx: req as unknown as AutumnContext,
		customer,
		customerData,
	});

	if (updated) {
		customer = await CusService.getFull({
			db,
			idOrInternalId: customer.id || customer.internal_id,
			orgId: org.id,
			env,
			inStatuses,
			withEntities,
			entityId,
			expand,
			withSubs: true,
		});
	}

	// Customer is defined by this point!
	customer = customer as FullCustomer;

	if (entityId && !customer.entity) {
		logger.info(`Auto creating entity ${entityId} for customer ${customerId}`);

		const newEntity = (await autoCreateEntity({
			ctx: req as unknown as AutumnContext,
			customerId: customer.id || customer.internal_id,
			entityId,
			entityData: {
				name: entityData?.name,
				feature_id: entityData?.feature_id || "",
			},
		})) as Entity;

		customer.entities = [...(customer.entities || []), newEntity];
		customer.entity = newEntity;
	}

	return customer as FullCustomer;
};
