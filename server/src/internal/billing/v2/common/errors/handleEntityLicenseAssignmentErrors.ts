import {
	ErrCode,
	type FullCustomer,
	filterLicenseAssignmentsByEntityId,
	RecaseError,
} from "@autumn/shared";

/** An entity holding a license seat gets its plan through the pool — direct
 * attach/update on that entity is blocked until the seat is released. */
export const handleEntityLicenseAssignmentErrors = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) => {
	const entity = fullCustomer.entity;
	if (!entity) return;

	const [assignment] = filterLicenseAssignmentsByEntityId({
		customerProducts: fullCustomer.customer_products,
		internalEntityId: entity.internal_id,
	});
	if (!assignment) return;

	throw new RecaseError({
		message:
			`Entity ${entity.id ?? entity.internal_id} holds a license ` +
			`(${assignment.product.id}) — its plan is managed through the license. ` +
			`Release it first via licenses.release.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
