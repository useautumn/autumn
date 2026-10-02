import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { fetchExpiredTrialProducts } from "./fetchExpiredTrialProducts.js";
import { processExpiredTrialRow } from "./processExpiredTrialRow.js";

const BATCH_SIZE = 100;

export const expireTrialProductsForCustomer = async ({
	ctx,
	internalCustomerId,
	nowMs,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	nowMs: number;
}) => {
	const rows = await fetchExpiredTrialProducts({
		batchSize: BATCH_SIZE,
		db: ctx.db,
		nowMs,
		internalCustomerId,
	});

	if (rows.length === 0) return;

	const defaultProducts = await ProductService.listDefault({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		onlyFree: true,
	});

	for (const row of rows) {
		await processExpiredTrialRow({
			ctx,
			customerProduct: row.customerProduct,
			customer: row.customer,
			defaultProducts,
		});
	}
};
