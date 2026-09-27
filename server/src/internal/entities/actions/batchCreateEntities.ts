import type { CreateEntityParams, CustomerData, Entity } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity";
import { createEntitiesV2 } from "./createEntitiesV2/createEntitiesV2";

type BatchCreateEntitiesParams = {
	ctx: AutumnContext;
	customerData?: CustomerData;
	customerId: string;
	createEntityData: CreateEntityParams[] | CreateEntityParams;
	withAutumnId?: boolean;
};

/** The created entities rendered from a fresh read, the way `entities.get` sees them. */
const readApiEntities = async ({
	ctx,
	customerId,
	entities,
	withAutumnId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entities: Entity[];
	withAutumnId: boolean;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const apiEntities = [];
	for (const entity of entities) {
		const apiEntity = await getApiEntity({
			ctx,
			customerId,
			entityId: entity.id ?? entity.internal_id,
			fullCus: { ...fullCustomer, entity },
			withAutumnId,
		});
		apiEntities.push(apiEntity);
	}
	return apiEntities;
};

const createEntities = async ({
	ctx,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
}: BatchCreateEntitiesParams) => {
	const { entities } = await createEntitiesV2({
		ctx,
		params: {
			customerId,
			customerData,
			entities: Array.isArray(createEntityData)
				? createEntityData
				: [createEntityData],
			allowPaidFeatures: true,
		},
	});

	return readApiEntities({ ctx, customerId, entities, withAutumnId });
};

export const batchCreateEntities = async (
	params: BatchCreateEntitiesParams,
) => {
	const { ctx, customerId } = params;
	const { org, env } = ctx;

	return withLock({
		lockKey: `lock:create-entity-request:${org.id}:${env}:${customerId}`,
		errorMessage:
			"Entity creation already in progress for this customer, try again in a few seconds",
		fn: () => createEntities(params),
	});
};
