import { catalogRowsEnvelopeToCatalogRows } from "@autumn/catalog-lru";
import { getOrgWithFeatures, getSharedCatalogRows } from "@autumn/postgres";
import type { AppEnv } from "@autumn/shared";
import { orgToAtomConnection } from "../../../atom/orgToAtomConnection.js";
import type { CatalogPushContext } from "../types/catalogPushContext.js";

/**
 * An org's whole shared catalog into its Atom, as Postgres holds it now; skipped unless that Atom is ready.
 * An Atom that does not take it is logged and left behind: each customer's push still carries its own rows.
 */
export const pushCatalogToCache = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: CatalogPushContext;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	// Straight from Postgres: the org's cached copy can predate its Atom becoming ready.
	const orgWithFeatures = await getOrgWithFeatures({ ctx, orgId, env });
	if (!orgWithFeatures) return;
	const atomConnection = orgToAtomConnection({ org: orgWithFeatures.org, env });
	if (!atomConnection) return;

	// Taken before the read: a catalog change that lands during it must still count as newer.
	const readAt = Date.now();
	const envelope = await getSharedCatalogRows({
		ctx: { db: ctx.db, orgId, env },
	});
	const rows = catalogRowsEnvelopeToCatalogRows({ envelope });
	try {
		const atomClient = ctx.getAtomClient({ connection: atomConnection });
		await atomClient.setCatalog({ rows, readAt });
	} catch (error) {
		ctx.logger.warn(
			{
				error,
				type: "herald_atom_catalog_push_failed",
				data: { orgId, env, rowCount: rows.length },
			},
			"An org's Atom did not take its catalog; customers unchanged since the edit stay on the old rows",
		);
	}
};
