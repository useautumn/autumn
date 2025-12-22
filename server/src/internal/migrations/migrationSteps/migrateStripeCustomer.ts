import {
	type AppEnv,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { migrationToAttachParams } from "../migrationUtils/migrationToAttachParams.js";
import { runMigrationAttach } from "../migrationUtils/runMigrationAttach.js";

export const migrateStripeCustomer = async ({
	req,
	stripeCli,
	fullCus,
	cusProduct,
	toProduct,
	fromProduct,
	customerId,
	orgId,
	env,
}: {
	req: ExtendedRequest;
	stripeCli: Stripe;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toProduct: FullProduct;
	fromProduct: FullProduct;
	customerId: string;
	orgId: string;
	env: AppEnv;
}) => {
	const attachParams = await migrationToAttachParams({
		req,
		stripeCli,
		customer: fullCus,
		cusProduct,
		newProduct: toProduct,
	});

	await runMigrationAttach({
		ctx: req as unknown as AutumnContext,
		attachParams,
		fromProduct,
	});

	await deleteCachedApiCustomer({
		customerId,
		orgId,
		env,
	});
};
