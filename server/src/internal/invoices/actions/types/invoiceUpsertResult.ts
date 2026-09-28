import type { Invoice } from "@autumn/shared";
import type { UpsertCachedInvoiceV2Result } from "@/internal/customers/cache/fullSubject/actions/upsertCachedInvoiceV2.js";

export type InvoiceUpsertResult = {
	invoice: Invoice | undefined;
	cacheResult: UpsertCachedInvoiceV2Result | null;
};
