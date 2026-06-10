import type { CusProductStatus, SubjectQueryRow } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { mergeEntityAndCustomerSubjectRows } from "@/internal/customers/repos/getFullSubject/mergeEntityAndCustomerSubjectRows.js";
import { getCustomerLevelSubjectRowsQuery } from "./customerLevelSubjectsQuery.js";

/** Fetches customer-level data once per distinct customer on the page and merges it into each entityScopedOnly row. */
export const hydrateEntityRowsWithCustomerData = async ({
	ctx,
	entityRows,
	inStatuses,
}: {
	ctx: RequestContext;
	entityRows: SubjectQueryRow[];
	inStatuses: CusProductStatus[];
}): Promise<SubjectQueryRow[]> => {
	if (entityRows.length === 0) return entityRows;

	const internalCustomerIds = [
		...new Set(entityRows.map((row) => row.customer.internal_id)),
	];

	const customerRows = (await ctx.db.execute(
		getCustomerLevelSubjectRowsQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			internalCustomerIds,
			inStatuses,
		}),
	)) as unknown as SubjectQueryRow[];

	const customerRowsByInternalId = new Map(
		customerRows.map((row) => [row.customer.internal_id, row]),
	);

	return entityRows.map((entityRow) => {
		const customerRow = customerRowsByInternalId.get(
			entityRow.customer.internal_id,
		);
		if (!customerRow) {
			ctx.logger.warn(
				`[hydrateEntityRowsWithCustomerData] missing customer-level row for internal customer id ${entityRow.customer.internal_id}`,
			);
		}
		return mergeEntityAndCustomerSubjectRows({ entityRow, customerRow });
	});
};
