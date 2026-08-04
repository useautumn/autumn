import { Readable } from "node:stream";
import type { CustomerExportSnapshot } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerExportRow } from "../../csv/createCustomerExportStringifier.js";
import {
	emptyPlanColumns,
	getCustomerExportPlanColumns,
} from "../../queries/getCustomerExportPlanColumns.js";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	type CustomerExportPopulation,
	getCustomerExportScalars,
} from "../../queries/getCustomerExportScalars.js";
import { createOneOffProductLookup } from "../../queries/getOneOffProductLookup.js";

export const createCustomerExportRowStream = ({
	ctx,
	snapshot,
	population,
	onPageProcessed,
}: {
	ctx: AutumnContext;
	snapshot: CustomerExportSnapshot;
	population: CustomerExportPopulation;
	onPageProcessed: (rowCount: number) => Promise<void> | void;
}): Readable => {
	const oneOffProductLookup = createOneOffProductLookup({ db: ctx.db });

	const exportRows = async function* (): AsyncGenerator<CustomerExportRow> {
		let afterInternalId: string | null = null;
		let hasMorePages = true;

		while (hasMorePages) {
			const scalars = await getCustomerExportScalars({
				db: ctx.db,
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
				db: ctx.db,
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

			await onPageProcessed(scalars.length);

			afterInternalId = lastScalar.internal_id;
			hasMorePages = scalars.length === CUSTOMER_EXPORT_PAGE_SIZE;
		}
	};

	return Readable.from(exportRows(), { objectMode: true });
};
