import { RowsInvalidError } from "../../../common/parseRows.js";
import type { PostgresContext } from "../../../types/postgresClient.js";
import {
	type CatalogRowIds,
	type CatalogRowsEnvelope,
	catalogRowsEnvelopeSchema,
} from "../../types/catalogRowsEnvelope.js";
import { catalogRowsSql } from "./catalogRowsSql.js";

const emptyEnvelope: CatalogRowsEnvelope = {
	entitlements: [],
	products: [],
	features: [],
};

/** Returns only the rows that exist; a missing id is the caller's decision. */
export const getCatalogRows = async ({
	ctx,
	ids,
}: {
	ctx: PostgresContext;
	ids: CatalogRowIds;
}): Promise<CatalogRowsEnvelope> => {
	const wanted =
		ids.entitlementIds.length +
		ids.productInternalIds.length +
		ids.featureInternalIds.length;
	if (wanted === 0) return emptyEnvelope;

	const rows = await ctx.db.execute<{ envelope: unknown }>(
		catalogRowsSql({ ctx, ids }),
	);
	const parsed = catalogRowsEnvelopeSchema.safeParse(rows[0]?.envelope);
	if (!parsed.success) {
		throw new RowsInvalidError({
			table: "catalog",
			issues: parsed.error.issues,
		});
	}
	return parsed.data;
};
