import type { InsertCustomerProduct } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
import { CusProductService } from "../CusProductService";

export const batchUpdateCustomerProducts = async ({
	ctx,

	updates,
}: {
	ctx: RepoContext;

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
			ctx,
			cusProductId: id,
			updates: updateData,
		});
	});

	await Promise.all(updatePromises);
};
