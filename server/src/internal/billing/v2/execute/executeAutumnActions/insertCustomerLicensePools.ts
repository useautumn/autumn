import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";

/** License pools born with their parent product (after it, for the FK); conflicts defer to upsertGranted/reconcile. */
export const insertCustomerLicensePools = async ({
	ctx,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	await customerLicenseRepo.insertMany({
		db: ctx.db,
		rows: customerProducts.flatMap((customerProduct) =>
			(customerProduct.customer_licenses ?? []).map(
				({ planLicense: _planLicense, ...row }) => row,
			),
		),
	});
};
