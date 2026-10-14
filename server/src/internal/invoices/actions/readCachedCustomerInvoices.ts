import {
	getCachedCustomerInvoices,
	setCachedCustomerInvoices,
} from "@autumn/cache";
import type { Invoice } from "@autumn/shared";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { InvoiceService } from "../InvoiceService.js";

const CUSTOMER_INVOICE_LIMIT = 10;

export const readCachedCustomerInvoices = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Pick<AutumnContext, "db" | "id" | "skipCache">;
	internalCustomerId: string;
}): Promise<Invoice[]> => {
	const readFromPostgres = () =>
		InvoiceService.list({
			db: ctx.db,
			internalCustomerId,
			limit: CUSTOMER_INVOICE_LIMIT,
		});
	if (ctx.skipCache) return readFromPostgres();

	const cacheContext = getMiscCacheContext();
	const cached = await getCachedCustomerInvoices({
		ctx: cacheContext,
		internalCustomerId,
		requestId: ctx.id,
	});
	if (cached) return cached;

	const invoices = await readFromPostgres();
	await setCachedCustomerInvoices({
		ctx: cacheContext,
		internalCustomerId,
		invoices,
		requestId: ctx.id,
	});
	return invoices;
};
