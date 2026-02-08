import {
	ACTIVE_STATUSES,
	type FullCusProduct,
	type FullProduct,
	type MigrationJob,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { CusProductService } from "../../customers/cusProducts/CusProductService.js";
import { createMigrationCustomerLogger } from "../migrationUtils/createMigrationCustomerLogger.js";
import { migrateRevenueCatCustomer } from "./migrateRevenuecatCustomer.js";

export const migrateCustomer = async ({
	ctx,
	customerId,
	fromProduct,
	toProduct,
	migrationJob,
}: {
	ctx: AutumnContext;
	customerId: string;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	migrationJob?: MigrationJob;
}) => {
	const { db, org, env } = ctx;
	const orgId = org.id;

	// Create customer-specific logger
	const customerLogger = createMigrationCustomerLogger({
		ctx,
		customerId,
	});

	const customerCtx: AutumnContext = { ...ctx, logger: customerLogger };

	try {
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId,
			env,
			withEntities: true,
			inStatuses: ACTIVE_STATUSES,
		});

		const cusProducts = fullCus.customer_products;
		const filteredCusProducts = cusProducts.filter(
			(cp: FullCusProduct) =>
				cp.product.internal_id === fromProduct.internal_id,
		);

		customerLogger.debug(
			`Filtered customer products ${filteredCusProducts.length}`,
		);

		for (let i = 0; i < filteredCusProducts.length; i++) {
			const cusProduct = filteredCusProducts[i];
			if (cusProduct.processor?.type === ProcessorType.RevenueCat) {
				await migrateRevenueCatCustomer({
					ctx: customerCtx,
					fullCus,
					cusProduct,
					toProduct,
					customerId,
				});
			} else {
				await billingActions.migrate({
					ctx: customerCtx,
					fullCustomer: fullCus,
					currentCustomerProduct: cusProduct,
					newProduct: toProduct,
				});
				// await migrateStripeCustomer({
				// 	ctx: customerCtx,
				// 	stripeCli,
				// 	fullCus,
				// 	cusProduct,
				// 	toProduct,
				// 	fromProduct,
				// 	customerId,
				// });
			}

			// If not last, refresh full customer with new cusProducts
			if (i < filteredCusProducts.length - 1) {
				const latestCusProducts = await CusProductService.list({
					db,
					internalCustomerId: fullCus.internal_id,
					inStatuses: ACTIVE_STATUSES,
				});

				fullCus.customer_products = latestCusProducts;
			}

			await deleteCachedApiCustomer({
				customerId: fullCus.id ?? "",
				ctx,
			});
		}

		return true;
	} catch (error) {
		customerLogger.error(
			`Migration failed for customer ${customerId}, job id: ${migrationJob?.id}`,
		);
		customerLogger.error(error);

		return false;
	}
};
