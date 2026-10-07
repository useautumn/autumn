import {
	type CreateInvoiceParams,
	type Entity,
	ErrCode,
	type FullCustomer,
	type InvoicePlanParams,
	RecaseError,
} from "@autumn/shared";

/** The entity a plan bills to: its own entity_id, else the request's; null means customer-level. */
export const resolveInvoicePlanEntity = ({
	fullCustomer,
	params,
	planParams,
}: {
	fullCustomer: FullCustomer;
	params: CreateInvoiceParams;
	planParams: InvoicePlanParams;
}): Entity | undefined => {
	const entityId =
		planParams.entity_id === undefined
			? params.entity_id
			: (planParams.entity_id ?? undefined);
	if (!entityId) return undefined;

	const entity = fullCustomer.entities?.find(
		(candidate) => candidate.id === entityId && !candidate.deleted,
	);
	if (!entity) {
		throw new RecaseError({
			message: `Entity ${entityId} not found for customer ${params.customer_id}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return entity;
};

/** True when any plan bills to an entity, so the customer must be loaded with its entities. */
export const invoiceNamesEntities = ({
	params,
}: {
	params: CreateInvoiceParams;
}) =>
	Boolean(params.entity_id) ||
	(params.plans ?? []).some((plan) => Boolean(plan.entity_id));
