import {
	type CusProductStatus,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	LICENSE_ACTIVE_ASSIGNMENT_STATUSES,
	LICENSE_ASSIGNABLE_STATUSES,
	LICENSE_PARENT_STATUSES,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { nullish } from "@/utils/genUtils.js";

export const getFullLicenseProduct = async ({
	ctx,
	idOrInternalId,
}: {
	ctx: AutumnContext;
	idOrInternalId: string;
}) =>
	await ProductService.getFull({
		db: ctx.db,
		idOrInternalId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

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
export const licenseParentStatuses = LICENSE_PARENT_STATUSES;

export const licenseActiveAssignmentStatuses =
	LICENSE_ACTIVE_ASSIGNMENT_STATUSES;

const licenseAssignableStatuses = LICENSE_ASSIGNABLE_STATUSES;

const isLicensePoolParentStatus = ({ status }: { status: string | null }) =>
	licenseParentStatuses.includes(status as CusProductStatus);

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
