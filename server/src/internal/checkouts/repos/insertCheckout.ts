import { type Checkout, checkouts, type InsertCheckout } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

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
