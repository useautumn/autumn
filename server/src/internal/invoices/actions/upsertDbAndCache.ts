import type { InsertInvoice, Invoice } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "../InvoiceService";
import { upsertInvoiceInCache } from "./cache/upsertInvoiceInCache";

export const upsertInvoiceToDbAndCache = async ({
	ctx,
	customerId,
	invoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	invoice: InsertInvoice;
}): Promise<Invoice | undefined> => {
	const { db } = ctx;
	const upsertedInvoice = await InvoiceService.upsert({ db, invoice });

	// Upsert invoice in cache
	if (upsertedInvoice) {
		await upsertInvoiceInCache({
			ctx,
			customerId,
			invoice: upsertedInvoice,
		});
	}
	return upsertedInvoice;
};
