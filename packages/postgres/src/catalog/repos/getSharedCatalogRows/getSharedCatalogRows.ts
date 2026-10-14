import { RowsInvalidError } from "../../../common/parseRows.js";
import type { PostgresContext } from "../../../types/postgresClient.js";
import {
	type CatalogRowsEnvelope,
	catalogRowsEnvelopeSchema,
} from "../../types/catalogRowsEnvelope.js";
import { sharedCatalogRowsSql } from "./sharedCatalogRowsSql.js";

export const getSharedCatalogRows = async ({
	ctx,
}: {
	ctx: PostgresContext;
}): Promise<CatalogRowsEnvelope> => {
	const { rows } = await ctx.db.execute(sharedCatalogRowsSql({ ctx }));
	const parsed = catalogRowsEnvelopeSchema.safeParse(rows[0]?.envelope);
	if (!parsed.success) {
		throw new RowsInvalidError({
			table: "catalog",
			issues: parsed.error.issues,
		});
	}
	return parsed.data;
};
