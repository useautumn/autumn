import { CusProductStatus, customerProducts } from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { getFullPlan } from "../../../../licenses/utils/seedLicensePlans.js";

/** Seat-assignment CP on an already-attached parent customer. */
export const seedAssignmentCpOnExistingCustomer = async ({
	ctx,
	customerId,
	childId,
}: {
	ctx: AutumnContext;
	customerId: string;
	childId: string;
}) => {
	const state = await getLicenseDbState({ db: ctx.db, customerId });
	const pool = state.pools[0];
	if (!pool) throw new Error(`no license pool for ${customerId}`);
	const parentCustomerProduct = state.products.find(
		(customerProduct) => customerProduct.customer_license_link_id == null,
	);
	if (!parentCustomerProduct) {
		throw new Error(`no parent customer product for ${customerId}`);
	}

	const child = await getFullPlan({ ctx, planId: childId });
	const assignmentCustomerProductId = generateId("cus_prod");
	await ctx.db.insert(customerProducts).values({
		id: assignmentCustomerProductId,
		internal_customer_id: parentCustomerProduct.internal_customer_id,
		product_id: childId,
		internal_product_id: child.internal_id,
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
		customer_license_link_id: pool.link_id,
	});
	return { assignmentCustomerProductId };
};
