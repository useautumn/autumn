import type { CustomerExportSnapshot } from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	type CustomerExportPopulation,
	type CustomerExportScalarRow,
	getCustomerExportScalars,
} from "../../queries/getCustomerExportScalars.js";

/** Keyset walk over the export's frozen population, one page of customers at a time. */
export const walkCustomerExportPages = async function* ({
	ctx,
	snapshot,
	population,
	pageSize = CUSTOMER_EXPORT_PAGE_SIZE,
}: {
	ctx: AutumnContext;
	snapshot: CustomerExportSnapshot;
	population: CustomerExportPopulation;
	pageSize?: number;
}): AsyncGenerator<CustomerExportScalarRow[]> {
	let afterInternalId: string | null = null;
	let hasMorePages = true;

	while (hasMorePages) {
		const scalars = await getCustomerExportScalars({
			db: dbReplica ?? ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			snapshot,
			upperBoundInternalId: population.upperBoundInternalId,
			createdAtCutoff: population.createdAtCutoff,
			afterInternalId,
			limit: pageSize,
		});
		const lastScalar = scalars[scalars.length - 1];
		if (!lastScalar) return;

		yield scalars;

		afterInternalId = lastScalar.internal_id;
		hasMorePages = scalars.length === pageSize;
	}
};
