import { checkouts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Delete a checkout record from the database.
 */
export async function deleteCheckout({
	db,
	id,
}: {
	db: DrizzleCli;
	id: string;
}): Promise<void> {
	await db.delete(checkouts).where(eq(checkouts.id, id));
}
