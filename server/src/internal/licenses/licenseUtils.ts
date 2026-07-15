import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

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
