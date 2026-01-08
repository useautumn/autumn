import type { FullCusProduct, FullCustomer, FullProduct } from "@autumn/shared";
import type { Stripe } from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { migrationToAttachParams } from "../migrationUtils/migrationToAttachParams.js";
import { runMigrationAttach } from "../migrationUtils/runMigrationAttach.js";

export const migrateStripeCustomer = async ({
	ctx,
	stripeCli,
	fullCus,
	cusProduct,
	toProduct,
	fromProduct,
	customerId,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toProduct: FullProduct;
	fromProduct: FullProduct;
	customerId: string;
}) => {
	const { org, env } = ctx;

	const attachParams = await migrationToAttachParams({
		ctx,
		stripeCli,
		customer: fullCus,
		cusProduct,
		newProduct: toProduct,
	});

	await runMigrationAttach({
		ctx,
		attachParams,
		fromProduct,
	});

	await deleteCachedApiCustomer({
		customerId,
		orgId: org.id,
		env,
	});
};
