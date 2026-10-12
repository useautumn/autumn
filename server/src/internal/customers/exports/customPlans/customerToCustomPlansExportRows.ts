import type {
	CustomPlansExportRow,
	CustomPlansExportSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveStoredCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveStoredCustomerProductIsCustom.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import { CusService } from "../../CusService.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import { retryExportDbRead } from "../verify/retryExportDbRead.js";
import {
	applyIsCustomFlips,
	type DerivedCustomerProduct,
} from "./applyIsCustomFlips.js";
import {
	customerProductToCustomPlansExportRow,
	failedCustomerToCustomPlansExportRow,
	isCustomerProductInExportScope,
} from "./customPlansExportRow.js";
import { rederiveFlipsAgainstFreshCatalog } from "./rederiveFlipsAgainstFreshCatalog.js";

/** Every plan must reach the file, so the org's customer-product page size is lifted. */
const CUSTOM_PLANS_EXPORT_CUS_PRODUCT_LIMIT = 10_000;

export const customerToCustomPlansExportRows = async ({
	ctx,
	scalar,
	snapshot,
	baseProducts,
}: {
	ctx: AutumnContext;
	scalar: CustomerExportScalarRow;
	snapshot: CustomPlansExportSpec["snapshot"];
	baseProducts: BaseProductCache;
}): Promise<CustomPlansExportRow[]> => {
	const readFullCustomer = retryExportDbRead({
		logger: ctx.logger,
		operation: "CusService.getFull",
		query: (params: Parameters<typeof CusService.getFull>[0]) =>
			CusService.getFull(params),
	});

	try {
		const fullCustomer = await readFullCustomer({
			ctx,
			idOrInternalId: scalar.internal_id,
			withEntities: true,
			skipReset: true,
			cusProductLimit: CUSTOM_PLANS_EXPORT_CUS_PRODUCT_LIMIT,
		});
		const customerProducts = fullCustomer.customer_products.filter(
			(customerProduct) =>
				isCustomerProductInExportScope({
					customerProduct,
					filters: snapshot.filters,
				}),
		);

		const derived = await Promise.all(
			customerProducts.map(
				async (customerProduct): Promise<DerivedCustomerProduct> => ({
					customerProduct,
					result: await deriveStoredCustomerProductIsCustom({
						ctx,
						customerProduct,
						baseProducts,
					}),
				}),
			),
		);

		const confirmed = snapshot.apply
			? await rederiveFlipsAgainstFreshCatalog({ ctx, derived })
			: derived;
		const applied = snapshot.apply
			? await applyIsCustomFlips({ ctx, scalar, derived: confirmed })
			: null;

		return confirmed.map(({ customerProduct, result }) =>
			customerProductToCustomPlansExportRow({
				scalar,
				fullCustomer,
				customerProduct,
				result,
				applied: applied ? applied.has(customerProduct.id) : null,
			}),
		);
	} catch (error) {
		return [failedCustomerToCustomPlansExportRow({ scalar, error })];
	}
};
