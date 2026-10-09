import type { CustomerListFilters, CustomPlansExportRow } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveStoredCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveStoredCustomerProductIsCustom.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import { CusService } from "../../CusService.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import { retryExportDbRead } from "../verify/retryExportDbRead.js";
import {
	customerProductToCustomPlansExportRow,
	failedCustomerToCustomPlansExportRow,
	isCustomerProductInExportScope,
} from "./customPlansExportRow.js";

/** Every plan must reach the file, so the org's customer-product page size is lifted. */
const CUSTOM_PLANS_EXPORT_CUS_PRODUCT_LIMIT = 10_000;

export const customerToCustomPlansExportRows = async ({
	ctx,
	scalar,
	filters,
	baseProducts,
}: {
	ctx: AutumnContext;
	scalar: CustomerExportScalarRow;
	filters: CustomerListFilters;
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
				isCustomerProductInExportScope({ customerProduct, filters }),
		);

		return await Promise.all(
			customerProducts.map(async (customerProduct) => {
				const result = await deriveStoredCustomerProductIsCustom({
					ctx,
					customerProduct,
					baseProducts,
				});
				return customerProductToCustomPlansExportRow({
					scalar,
					fullCustomer,
					customerProduct,
					result,
				});
			}),
		);
	} catch (error) {
		return [failedCustomerToCustomPlansExportRow({ scalar, error })];
	}
};
