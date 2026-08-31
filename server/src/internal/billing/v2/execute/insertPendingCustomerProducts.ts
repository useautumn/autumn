import { type BillingPlan, CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertCustomCatalogRows } from "@/internal/billing/v2/execute/executeAutumnActions/insertCustomCatalogRows";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";

export const insertPendingCustomerProducts = async ({
	ctx,
	billingPlan,
	metadataId,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	metadataId: string;
}) => {
	const autumnBillingPlan = billingPlan.autumn;
	const { insertCustomerProducts } = autumnBillingPlan;

	if (!insertCustomerProducts?.length) return;

	await insertCustomCatalogRows({ ctx, autumnBillingPlan });

	await insertNewCusProducts({
		ctx,
		newCusProducts: insertCustomerProducts.map((customerProduct) => ({
			...customerProduct,
			status: CusProductStatus.Pending,
			metadata_id: metadataId,
		})),
	});
};
