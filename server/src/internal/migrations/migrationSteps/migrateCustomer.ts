import {
	type AppEnv,
	type Feature,
	type FullCusProduct,
	type FullProduct,
	type MigrationJob,
	type Organization,
	ProcessorType,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { Logger } from "../../../external/logtail/logtailUtils.js";
import { migrateRevenueCatCustomer } from "./migrateRevenuecatCustomer.js";
import { migrateStripeCustomer } from "./migrateStripeCustomer.js";

export const migrateCustomer = async ({
	db,
	customerId,
	org,
	logger,
	env,
	orgId,
	fromProduct,
	toProduct,
	features,
	migrationJob,
}: {
	db: DrizzleCli;
	customerId: string;
	org: Organization;
	env: AppEnv;
	orgId: string;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	logger: Logger;
	features: Feature[];
	migrationJob?: MigrationJob;
}) => {
	try {
		const stripeCli = createStripeCli({ org, env });
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId,
			env,
			withEntities: true,
		});

		// 1. Build req object
		const req = {
			db,
			orgId,
			env,
			org,
			features,
			logger,
			timestamp: Date.now(),
		} as ExtendedRequest;

		const cusProducts = fullCus.customer_products;
		const filteredCusProducts = cusProducts.filter(
			(cp: FullCusProduct) =>
				cp.product.internal_id === fromProduct.internal_id,
		);

		for (const cusProduct of filteredCusProducts) {
			if (cusProduct.processor?.type === ProcessorType.RevenueCat) {
				await migrateRevenueCatCustomer({
					req,
					fullCus,
					cusProduct,
					toProduct,
					customerId,
					orgId,
					env,
				});
			} else {
				await migrateStripeCustomer({
					req,
					stripeCli,
					fullCus,
					cusProduct,
					toProduct,
					fromProduct,
					customerId,
					orgId,
					env,
				});
			}
		}

		return true;
	} catch (error: any) {
		logger.error(
			`Migration failed for customer ${customerId}, job id: ${migrationJob?.id}`,
		);
		logger.error(error);

		return false;
	}
};
