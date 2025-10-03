import type {
	AppEnv,
	Feature,
	FullCusProduct,
	FullProduct,
	MigrationJob,
	Organization,
} from "@autumn/shared";

import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { migrationToAttachParams } from "../migrationUtils/migrationToAttachParams.js";
import { runMigrationAttach } from "../migrationUtils/runMigrationAttach.js";

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
	logger: any;
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
			logtail: logger,
			timestamp: Date.now(),
		} as ExtendedRequest;

		const cusProducts = fullCus.customer_products;
		const filteredCusProducts = cusProducts.filter(
			(cp: FullCusProduct) =>
				cp.product.internal_id === fromProduct.internal_id,
		);

		for (const cusProduct of filteredCusProducts) {
			const attachParams = await migrationToAttachParams({
				req,
				stripeCli,
				customer: fullCus,
				cusProduct,
				newProduct: toProduct,
			});

			await runMigrationAttach({
				req,
				attachParams,
				fromProduct,
			});

			await deleteCusCache({
				db,
				customerId,
				org,
				env,
			});
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
