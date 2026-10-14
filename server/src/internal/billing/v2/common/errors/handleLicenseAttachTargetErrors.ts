import {
	ErrCode,
	type FullCustomer,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

const findLicenseParentPlanId = ({
	fullCustomer,
	licenseProduct,
}: {
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
}): string | null => {
	const parentInternalProductIds = new Set(
		(licenseProduct.parent_plan_licenses ?? []).map(
			(link) => link.parent_internal_product_id,
		),
	);

	for (const customerProduct of fullCustomer.customer_products) {
		if (parentInternalProductIds.has(customerProduct.internal_product_id)) {
			return customerProduct.product.id;
		}
		const pool = (customerProduct.customer_licenses ?? []).find(
			(customerLicense) =>
				customerLicense.planLicense?.product.id === licenseProduct.id,
		);
		if (pool) return customerProduct.product.id;
	}
	return null;
};

export const handleLicenseAttachTargetErrors = ({
	fullCustomer,
	attachProduct,
}: {
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
}) => {
	const entity = fullCustomer.entity;
	if (entity && attachProduct.licenses?.length) {
		throw new RecaseError({
			message:
				`Plan ${attachProduct.id} offers licenses, so it can only be attached ` +
				`to the customer — not to entity ${entity.id ?? entity.internal_id}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const parentPlanId = findLicenseParentPlanId({
		fullCustomer,
		licenseProduct: attachProduct,
	});
	if (parentPlanId) {
		throw new RecaseError({
			message:
				`Plan ${attachProduct.id} is a license under ${parentPlanId}, which ` +
				`this customer is on. Assign seats with licenses.attach instead of ` +
				`attaching it directly.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
