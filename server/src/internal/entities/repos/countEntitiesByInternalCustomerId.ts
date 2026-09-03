import { entities } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Capped count of a customer's live entities. The inner LIMIT stops the scan
 * at `cap` rows, so huge customers cost O(cap) instead of a full count. */
export const countEntitiesByInternalCustomerId = async ({
	db,
	internalCustomerId,
	cap,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	cap: number;
}): Promise<number> => {
	const capped = db
		.select({ one: sql`1`.as("one") })
		.from(entities)
		.where(
			and(
				eq(entities.internal_customer_id, internalCustomerId),
				eq(entities.deleted, false),
			),
		)
		.limit(cap)
		.as("capped_entities");
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(capped);
	return row?.value ?? 0;
};
