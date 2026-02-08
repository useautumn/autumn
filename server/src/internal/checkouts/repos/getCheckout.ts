import { type Checkout, checkouts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Get checkout by ID from the database.
 * Note: This is for audit/backup purposes. Primary lookup should use cache.
 */
export async function getCheckout({
	db,
	id,
}: {
	db: DrizzleCli;
	id: string;
}): Promise<Checkout | null> {
	const result = await db
		.select()
		.from(checkouts)
		.where(eq(checkouts.id, id))
		.limit(1);

	return result[0] ?? null;
}
