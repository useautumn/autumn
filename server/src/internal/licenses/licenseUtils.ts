import {
	type ApiPlanLicenseV1,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

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
