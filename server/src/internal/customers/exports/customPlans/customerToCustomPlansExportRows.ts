import type {
	CustomerListFilters,
	CustomPlansExportRow,
	FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveCustomerProductIsCustom.js";
import { loadBaseProduct } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import { CusService } from "../../CusService.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import { retryExportDbRead } from "../verify/retryExportDbRead.js";
import {
	customerProductToCustomPlansExportRow,
	failedCustomerToCustomPlansExportRow,
	isCustomerProductInExportScope,
} from "./customPlansExportRow.js";

/** Catalog versions shared across the whole run, keyed by internal product id. */
export type BaseProductCache = Map<string, Promise<FullProduct | null>>;

const loadCachedBaseProduct = ({
	ctx,
	internalProductId,
	baseProducts,
}: {
	ctx: AutumnContext;
	internalProductId: string;
	baseProducts: BaseProductCache;
}) => {
	const cached = baseProducts.get(internalProductId);
	if (cached) return cached;
	const loading = loadBaseProduct({ ctx, internalProductId });
	baseProducts.set(internalProductId, loading);
	return loading;
};

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
		});
		const customerProducts = fullCustomer.customer_products.filter(
			(customerProduct) =>
				isCustomerProductInExportScope({ customerProduct, filters }),
		);

		return await Promise.all(
			customerProducts.map(async (customerProduct) => {
				const baseProduct = await loadCachedBaseProduct({
					ctx,
					internalProductId: customerProduct.internal_product_id,
					baseProducts,
				});
				const result = deriveCustomerProductIsCustom({
					ctx,
					customerProduct,
					baseProduct,
					features: ctx.features,
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
