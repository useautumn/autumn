import {
	CusProductStatus,
	type CustomerData,
	CustomerExpand,
	CustomerNotFoundError,
	type Entity,
	type EntityData,
	type FullCustomer,
} from "@autumn/shared";
import { customerActions } from "@/internal/customers/actions/index.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusService } from "../CusService.js";
import { updateCustomerDetails } from "./cusUtils.js";

export const getOrCreateCustomer = async ({
	ctx,
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
	skipUpdate = false,
	skipCreate = false,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
	inStatuses?: CusProductStatus[];
	skipGet?: boolean;
	withEntities?: boolean;
	expand?: CustomerExpand[];
	entityId?: string;
	entityData?: EntityData;
	skipUpdate?: boolean;
	skipCreate?: boolean;
}): Promise<FullCustomer> => {
	let customer: FullCustomer | undefined;

	const { db, org, env, logger } = ctx;

	if (!withEntities) {
		withEntities = expand?.includes(CustomerExpand.Entities) || false;
	}

	if (!skipGet && customerId) {
		customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses,
			withEntities,
			entityId,
			expand,
			allowNotFound: true,
			withSubs: true,
		});
	}

	if (!customer) {
		if (skipCreate) {
			throw new CustomerNotFoundError({ customerId: customerId || "" });
		}

		customer = await customerActions.createWithDefaults({
			ctx,
			customerId,
			customerData,
		});
	}

	if (!skipUpdate) {
		const updated = await updateCustomerDetails({
			ctx,
			customer,
			customerData,
		});

		if (updated) {
			customer = await CusService.getFull({
				ctx,
				idOrInternalId: customer.id || customer.internal_id,
				inStatuses,
				withEntities,
				entityId,
				expand,
				withSubs: true,
			});
		}
	}

	// Customer is defined by this point!
	customer = customer as FullCustomer;

	if (entityId && !customer.entity) {
		logger.info(`Auto creating entity ${entityId} for customer ${customerId}`);

		const newEntity = (await autoCreateEntity({
			ctx,
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
