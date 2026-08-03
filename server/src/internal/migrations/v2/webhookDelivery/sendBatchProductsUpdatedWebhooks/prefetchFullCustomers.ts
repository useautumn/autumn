import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusBatchService } from "@/internal/customers/CusBatchService.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

/** Full customers fetched per batched read. */
const PREFETCH_CHUNK_SIZE = 100;

/** One batched full-customer read per chunk — the legacy payload embeds the
 * full customer, so this is the fetch `sendProductsUpdated` would otherwise
 * run once per customer product. */
export const prefetchFullCustomers = async ({
	ctx,
	records,
}: {
	ctx: AutumnContext;
	records: MigrationWebhookRecord[];
}): Promise<Map<string, FullCustomer>> => {
	const internalCustomerIds = [
		...new Set(records.map((record) => record.internalCustomerId)),
	];
	const byInternalId = new Map<string, FullCustomer>();

	for (
		let offset = 0;
		offset < internalCustomerIds.length;
		offset += PREFETCH_CHUNK_SIZE
	) {
		const fullCustomers = await CusBatchService.getByInternalIds({
			ctx,
			internalCustomerIds: internalCustomerIds.slice(
				offset,
				offset + PREFETCH_CHUNK_SIZE,
			),
		});
		for (const fullCustomer of fullCustomers) {
			byInternalId.set(fullCustomer.internal_id, fullCustomer);
		}
	}
	return byInternalId;
};
