import { customerLicenses } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const carryCustomerLicenseState = async ({
	db,
	customerLicenseId,
	linkId,
	granted,
	remaining,
	paidQuantity,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	linkId: string;
	granted: number;
	remaining: number;
	paidQuantity: number;
}) => {
	await db
		.update(customerLicenses)
		.set({
			link_id: linkId,
			granted,
			remaining,
			paid_quantity: paidQuantity,
			updated_at: Date.now(),
		})
		.where(eq(customerLicenses.id, customerLicenseId));
};
