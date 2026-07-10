import { customerLicenses, customerProducts, customers } from "@autumn/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getLicenseDbState = async ({
	db,
	customerId,
}: {
	db: DrizzleCli;
	customerId: string;
}) => {
	const customer = await db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`Customer '${customerId}' not found`);

	const [assignments, pools, products] = await Promise.all([
		db.query.customerProducts.findMany({
			where: and(
				eq(customerProducts.internal_customer_id, customer.internal_id),
				isNotNull(customerProducts.license_parent_customer_product_id),
			),
		}),
		db.query.customerLicenses.findMany({
			where: eq(customerLicenses.internal_customer_id, customer.internal_id),
		}),
		db.query.customerProducts.findMany({
			where: eq(customerProducts.internal_customer_id, customer.internal_id),
		}),
	]);

	return { assignments, pools, products };
};
