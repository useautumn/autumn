import {
	CusProductStatus,
	customerProducts,
	customers,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";

/** Attach a customer to a specific plan version (no Stripe). Default Active. */
export const seedVersionableCustomer = async ({
	ctx,
	planId,
	version,
	isCustom = false,
	status = CusProductStatus.Active,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
	isCustom?: boolean;
	status?: CusProductStatus;
}) => {
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	const customerId = uniqueTestId("cv2_mig_cus");
	const internalCustomerId = generateId("cus");
	const cusProductId = generateId("cus_prod");

	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: customerId,
		email: `${customerId}@test.com`,
	});

	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: internalCustomerId,
		product_id: planId,
		internal_product_id: full.internal_id,
		status,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: isCustom,
	});

	return { customerId, internalCustomerId, cusProductId };
};
