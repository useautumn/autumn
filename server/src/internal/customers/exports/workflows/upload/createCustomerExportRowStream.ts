import { Readable } from "node:stream";
import { dbReplica } from "@/db/initDrizzle.js";
import type { CustomerExportRow } from "../../csv/createCustomerExportStringifier.js";
import {
	emptyPlanColumns,
	getCustomerExportPlanColumns,
} from "../../queries/getCustomerExportPlanColumns.js";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	getCustomerExportScalars,
} from "../../queries/getCustomerExportScalars.js";
import { createOneOffProductLookup } from "../../queries/getOneOffProductLookup.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";

export const createCustomerExportRowStream: CustomerExportRowStreamFactory = ({
	ctx,
	snapshot,
	population,
	onPageProcessed,
}) => {
	const readDb = dbReplica ?? ctx.db;
	const oneOffProductLookup = createOneOffProductLookup({ db: readDb });

	const exportRows = async function* (): AsyncGenerator<CustomerExportRow> {
		let afterInternalId: string | null = null;
		let hasMorePages = true;

		while (hasMorePages) {
			const scalars = await getCustomerExportScalars({
				db: readDb,
				orgId: ctx.org.id,
				env: ctx.env,
				snapshot,
				upperBoundInternalId: population.upperBoundInternalId,
				createdAtCutoff: population.createdAtCutoff,
				afterInternalId,
			});
			const lastScalar = scalars[scalars.length - 1];
			if (!lastScalar) break;

			const planColumnsByCustomer = await getCustomerExportPlanColumns({
				db: readDb,
				internalCustomerIds: scalars.map((scalar) => scalar.internal_id),
				oneOffProductLookup,
			});

			for (const scalar of scalars) {
				const planColumns =
					planColumnsByCustomer.get(scalar.internal_id) ?? emptyPlanColumns();
				yield {
					name: scalar.name,
					email: scalar.email,
					customer_id: scalar.id,
					subscriptions: planColumns.subscriptions,
					purchases: planColumns.purchases,
					licenses: planColumns.licenses,
				};
			}

			await onPageProcessed({
				customerCount: scalars.length,
				rowCount: scalars.length,
			});

			afterInternalId = lastScalar.internal_id;
			hasMorePages = scalars.length === CUSTOMER_EXPORT_PAGE_SIZE;
		}
	};

	return Readable.from(exportRows(), { objectMode: true });
};
