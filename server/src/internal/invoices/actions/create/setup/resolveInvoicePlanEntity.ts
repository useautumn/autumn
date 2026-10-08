import {
	type CreateInvoiceParams,
	type Entity,
	ErrCode,
	type FullCustomer,
	type InvoicePlanParams,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";

const requestedEntityId = ({
	params,
	planParams,
}: {
	params: CreateInvoiceParams;
	planParams: InvoicePlanParams;
}) =>
	planParams.entity_id === undefined
		? params.entity_id
		: (planParams.entity_id ?? undefined);

/** The customer's live entities the request names, read directly: a full customer hydrates only a capped page. */
export const loadInvoiceEntities = async ({
	ctx,
	fullCustomer,
	params,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: CreateInvoiceParams;
}): Promise<Map<string, Entity>> => {
	const entityIds = new Set(
		(params.plans ?? []).flatMap(
			(planParams) => requestedEntityId({ params, planParams }) ?? [],
		),
	);
	const found = await EntityService.listByCustomerAndIds({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
		ids: [...entityIds],
	});
	return new Map(found.map((entity) => [entity.id as string, entity]));
};

/** The entity a plan bills to: its own entity_id, else the request's; undefined means customer-level. */
export const resolveInvoicePlanEntity = ({
	entitiesById,
	params,
	planParams,
}: {
	entitiesById: Map<string, Entity>;
	params: CreateInvoiceParams;
	planParams: InvoicePlanParams;
}): Entity | undefined => {
	const entityId = requestedEntityId({ params, planParams });
	if (entityId === undefined) return undefined;

	const entity = entitiesById.get(entityId);
	if (!entity) {
		throw new RecaseError({
			message: `Entity ${entityId} not found for customer ${params.customer_id}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return entity;
};
