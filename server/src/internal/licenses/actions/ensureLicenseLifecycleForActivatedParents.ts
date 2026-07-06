import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { nullish } from "@/utils/genUtils.js";
import { isLicensePoolParentStatus } from "../licenseUtils.js";
import { planLicenseRepo } from "../repos/index.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";
import { reconcilePooledGrantsForCustomer } from "./reconcilePooledGrants.js";

/**
 * Insert-side license lifecycle for activation paths that bypass billing
 * execute (cron/webhook successors): ensures pools and pooled grants exist.
 */
export const ensureLicenseLifecycleForActivatedParents = async ({
	ctx,
	customerId,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerProducts: FullCusProduct[];
}) => {
	const candidates = customerProducts.filter(
		(customerProduct) =>
			nullish(customerProduct.internal_entity_id) &&
			isLicensePoolParentStatus({ status: customerProduct.status }) &&
			!customerProduct.license_set_customized,
	);
	if (candidates.length === 0) return;

	const links = await planLicenseRepo.listByParentInternalProductIds({
		db: ctx.db,
		parentInternalProductIds: [
			...new Set(
				candidates.map(
					(customerProduct) => customerProduct.internal_product_id,
				),
			),
		],
	});
	if (links.length === 0) return;

	await ensurePoolsForCustomerProducts({ ctx, customerProducts: candidates });
	await reconcilePooledGrantsForCustomer({ ctx, customerId });
};
