import { Readable } from "node:stream";
import { dbReplicaSlow } from "@/db/initDrizzle.js";
import type { CustomerExportRow } from "../../csv/createCustomerExportStringifier.js";
import {
	emptyPlanColumns,
	getCustomerExportPlanColumns,
} from "../../queries/getCustomerExportPlanColumns.js";
import { createOneOffProductLookup } from "../../queries/getOneOffProductLookup.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { walkCustomerExportPages } from "./walkCustomerExportPages.js";

export const createCustomerExportRowStream: CustomerExportRowStreamFactory = ({
	ctx,
	snapshot,
	population,
	onPageProcessed,
}) => {
	const readDb = dbReplicaSlow ?? ctx.db;
	const oneOffProductLookup = createOneOffProductLookup({ db: readDb });

	const exportRows = async function* (): AsyncGenerator<CustomerExportRow> {
		for await (const scalars of walkCustomerExportPages({
			ctx,
			snapshot,
			population,
		})) {
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
		}
	};

	return Readable.from(exportRows(), { objectMode: true });
};
