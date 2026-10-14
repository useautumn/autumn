import {
	ACTIVE_STATUSES,
	type AppEnv,
	customerProducts,
	customers,
	ProcessorType,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const listActiveRevenueCatPlansByOriginalTransaction = async ({
	db,
	orgId,
	env,
	originalTransactionId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	originalTransactionId: string;
}) =>
	db
		.select({
			id: customerProducts.id,
			internal_customer_id: customerProducts.internal_customer_id,
		})
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerProducts.internal_customer_id),
		)
		.where(
			and(
				sql`(${customerProducts.processor} ->> 'type') = ${ProcessorType.RevenueCat}`,
				sql`(${customerProducts.processor} ->> 'original_transaction_id') = ${originalTransactionId}`,
				inArray(customerProducts.status, ACTIVE_STATUSES),
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			),
		);
