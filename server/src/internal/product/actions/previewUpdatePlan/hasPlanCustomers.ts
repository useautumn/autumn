import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";

export const getPlanCustomerUsage = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}) => {
	const usage = await customerProductRepo.getVersioningUsageForProduct({
		db: ctx.db,
		internalProductId: product.internal_id,
	});

	return {
		hasCustomers: usage.hasVersionableCustomerProducts,
		customerCount: usage.versionableCustomerCount,
	};
};

export const hasPlanCustomers = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}) => {
	const { hasCustomers } = await getPlanCustomerUsage({ ctx, product });
	return hasCustomers;
};
