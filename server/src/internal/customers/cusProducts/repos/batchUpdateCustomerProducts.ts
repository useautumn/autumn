import type { InsertCustomerProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "../CusProductService.js";

/**
 * Batch update customer products by their IDs.
 * Each update is executed in parallel using Promise.all.
 */
export const batchUpdateCustomerProducts = async ({
	db,
	updates,
}: {
	db: DrizzleCli;
	updates: {
		id: string;
		updates: Partial<InsertCustomerProduct>;
	}[];
}): Promise<void> => {
	if (!updates || updates.length === 0) {
		return;
	}

	const updatePromises = updates.map(({ id, updates: updateData }) => {
		if (Object.keys(updateData ?? {}).length === 0) {
			return Promise.resolve();
		}

		return CusProductService.update({
			db,
			cusProductId: id,
			updates: updateData,
		});
	});

	await Promise.all(updatePromises);
};
