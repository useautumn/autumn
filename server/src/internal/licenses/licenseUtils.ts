import {
	type ApiPlanLicenseV1,
	type CusProductStatus,
	ErrCode,
	type FullCusProduct,
	type FullProduct,
	LICENSE_ASSIGNABLE_STATUSES,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { nullish } from "@/utils/genUtils.js";

export const toApiPlanLicenses = (
	licenses: NonNullable<FullProduct["licenses"]>,
): ApiPlanLicenseV1[] =>
	licenses.map((license) => ({
		license_plan_id: license.product.id,
		version: license.product.version,
		included: license.included,
		prepaid_only: license.prepaid_only,
	}));

export const getFullLicenseProduct = async ({
	ctx,
	idOrInternalId,
	version,
}: {
	ctx: AutumnContext;
	idOrInternalId: string;
	version?: number;
}) =>
	await ProductService.getFull({
		db: ctx.db,
		idOrInternalId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
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

const licenseAssignableStatuses = LICENSE_ASSIGNABLE_STATUSES;

export const isLicenseAssignableStatus = ({
	status,
}: {
	status: string | null;
}) => licenseAssignableStatuses.includes(status as CusProductStatus);

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
