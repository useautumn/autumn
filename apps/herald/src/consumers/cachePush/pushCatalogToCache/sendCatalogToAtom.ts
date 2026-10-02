import type { CatalogRow } from "@autumn/balance-engine";
import { atomPushFailureLevel } from "../../../atom/atomPushFailureLevel.js";
import type { AtomConnection } from "../../../atom/types/atomClient.js";
import type { CatalogPushContext } from "../types/catalogPushContext.js";

/** An Atom that does not take the catalog is logged and left behind: each customer's push still carries its own rows. */
export const sendCatalogToAtom = async ({
	ctx,
	atomConnection,
	rows,
	readAt,
	orgId,
}: {
	ctx: CatalogPushContext;
	atomConnection: AtomConnection;
	rows: CatalogRow[];
	readAt: number;
	orgId: string;
}): Promise<void> => {
	try {
		const atomClient = ctx.getAtomClient({ connection: atomConnection });
		await atomClient.setCatalog({ rows, readAt });
	} catch (error) {
		ctx.logger[atomPushFailureLevel({ atomConnection })](
			{
				error,
				type: "herald_atom_catalog_push_failed",
				data: {
					target: atomConnection.target,
					orgId,
					endpointUrl: atomConnection.endpointUrl,
					rowCount: rows.length,
				},
			},
			"An Atom did not take an org's catalog; customers unchanged since the edit stay on the old rows",
		);
	}
};
