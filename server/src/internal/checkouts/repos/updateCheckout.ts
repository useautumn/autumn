import { type Checkout, checkouts, type InsertCheckout } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Update a checkout record in the database.
 * Typically used to update status to completed after successful confirmation.
 */
export async function updateCheckout({
	db,
	id,
	updates,
}: {
	db: DrizzleCli;
	id: string;
	updates: Partial<InsertCheckout>;
}): Promise<Checkout | null> {
	const result = await db
		.update(checkouts)
		.set(updates)
		.where(eq(checkouts.id, id))
		.returning();

	return result[0] ?? null;
}
