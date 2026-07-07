import {
	CusProductStatus,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	RecaseError,
} from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

export const validateLicenseBillingMode = ({
	prepaidOnly,
}: {
	prepaidOnly: boolean;
}) => {
	if (prepaidOnly === false) {
		throw new RecaseError({
			message:
				"License overflow billing (prepaid_only: false) is not yet available. Set prepaid_only to true.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

type LicenseParentCandidate = Pick<
	FullCusProduct,
	"internal_entity_id" | "license_parent_customer_product_id" | "status"
>;

// PastDue retains pools/assignments/grants (dunning must not revoke assignments);
// new assignments still require an assignable status.
export const licensePoolParentStatuses = [
	CusProductStatus.Active,
	CusProductStatus.Trialing,
	CusProductStatus.PastDue,
];

const licenseAssignableStatuses = [
	CusProductStatus.Active,
	CusProductStatus.Trialing,
];

const isLicensePoolParentStatus = ({ status }: { status: string | null }) =>
	licensePoolParentStatuses.includes(status as CusProductStatus);

export const isLicenseAssignableStatus = ({
	status,
}: {
	status: string | null;
}) => licenseAssignableStatuses.includes(status as CusProductStatus);

export const isLicenseParentCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: LicenseParentCandidate;
}) =>
	nullish(customerProduct.internal_entity_id) &&
	nullish(customerProduct.license_parent_customer_product_id) &&
	isLicensePoolParentStatus({ status: customerProduct.status });

export const isLicenseAssignableParentCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: LicenseParentCandidate;
}) =>
	nullish(customerProduct.internal_entity_id) &&
	nullish(customerProduct.license_parent_customer_product_id) &&
	isLicenseAssignableStatus({ status: customerProduct.status });

export const findLicenseCarrier = ({
	fullCustomer,
	parentCustomerProductId,
	licenseInternalProductId,
}: {
	fullCustomer: FullCustomer;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
}): FullCusProduct | undefined =>
	fullCustomer.customer_products.find(
		(customerProduct) =>
			customerProduct.license_parent_customer_product_id ===
				parentCustomerProductId &&
			customerProduct.internal_product_id === licenseInternalProductId &&
			nullish(customerProduct.internal_entity_id) &&
			isLicenseAssignableStatus({ status: customerProduct.status }),
	);

/** Capacity = max(included, assigned): reparented or self-healed assignments
 * keep the pool sized to what is actually in use. */
export const licenseCapacityOf = ({
	balance,
	included,
}: {
	balance: { granted: number; remaining: number } | undefined | null;
	included: number;
}) => {
	const assigned = balance ? balance.granted - balance.remaining : 0;
	return Math.max(included, assigned);
};

export const computeLicenseInventory = ({
	included,
	assigned,
}: {
	included: number;
	assigned: number;
}) => ({
	included,
	assigned,
	available: Math.max(0, included - assigned),
});
