import {
	customerProducts,
	customers,
	type FullCustomer,
	products,
} from "@autumn/shared";
import { and, eq, isNotNull, or } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** Fetch all customer_products rows with a free trial for a given customer (or matching fingerprint). */
export const fetchCustomerProductFreeTrials = async ({
	ctx,
	fullCus,
}: {
	ctx: RepoContext;
	fullCus: FullCustomer;
}) => {
	const { db, org, env } = ctx;

	const rows = await db
		.select({
			plan_id: products.id,
			customer_id: customers.id,
			fingerprint: customers.fingerprint,
		})
		.from(customerProducts)
		.innerJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				or(
					eq(customers.id, fullCus.id ?? ""),
					fullCus.fingerprint
						? eq(customers.fingerprint, fullCus.fingerprint)
						: undefined,
				),
				eq(products.org_id, org.id),
				eq(products.env, env),
				isNotNull(customerProducts.trial_ends_at),
			),
		);

	return rows
		.filter((r) => r.customer_id !== null)
		.map((r) => ({
			plan_id: r.plan_id,
			customer_id: r.customer_id as string,
			fingerprint: r.fingerprint,
		}));
};
