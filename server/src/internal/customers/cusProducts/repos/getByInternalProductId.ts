import {
	type CusProduct,
	type CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getByInternalProductId = async ({
	db,
	internalProductId,
	limit = 1,
	inStatuses,
}: {
	db: DrizzleCli;
	internalProductId: string;
	limit?: number;
	inStatuses?: CusProductStatus[];
}): Promise<CusProduct[]> => {
	const data = await db.query.customerProducts.findMany({
		where: and(
			eq(customerProducts.internal_product_id, internalProductId),
			inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
		),
		limit,
	});

	return data as CusProduct[];
};
