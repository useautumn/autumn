import { type Checkout, checkouts, type InsertCheckout } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Insert a new checkout record into the database.
 * This is for audit/backup purposes - primary storage is in cache.
 */
export async function insertCheckout({
	db,
	data,
}: {
	db: DrizzleCli;
	data: InsertCheckout;
}): Promise<Checkout> {
	const result = await db.insert(checkouts).values(data).returning();
	return result[0] as Checkout;
}
