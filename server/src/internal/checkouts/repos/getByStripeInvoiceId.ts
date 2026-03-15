import { type Checkout, checkouts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export async function getByStripeInvoiceId({
	db,
	stripeInvoiceId,
}: {
	db: DrizzleCli;
	stripeInvoiceId: string;
}): Promise<Checkout | null> {
	const result = await db
		.select()
		.from(checkouts)
		.where(eq(checkouts.stripe_invoice_id, stripeInvoiceId))
		.limit(1);

	return result[0] ?? null;
}
