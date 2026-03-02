import {
	type AppEnv,
	CustomerExpand,
	customerProducts,
	customers,
	type FullCustomer,
	products,
} from "@autumn/shared";
import { and, eq, isNotNull, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getCusTrialsUsed = async ({
	db,
	fullCus,
	orgId,
	env,
	expand,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	orgId: string;
	env: AppEnv;
	expand?: CustomerExpand[];
}) => {
	if (!expand?.includes(CustomerExpand.TrialsUsed)) {
		return undefined;
	}

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
				eq(products.org_id, orgId),
				eq(products.env, env),
				isNotNull(customerProducts.free_trial_id),
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
