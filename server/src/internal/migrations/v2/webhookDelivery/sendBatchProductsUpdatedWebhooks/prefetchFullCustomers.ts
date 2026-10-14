import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusBatchService } from "@/internal/customers/CusBatchService.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

const PREFETCH_CHUNK_SIZE = 100;

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
