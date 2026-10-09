import { catalogRowsEnvelopeToCatalogRows } from "@autumn/catalog-lru";
import { getOrgWithFeatures, getSharedCatalogRows } from "@autumn/postgres";
import type { AppEnv } from "@autumn/shared";
import { orgToAtomTargets } from "../../../atom/orgToAtomTargets.js";
import type { CatalogPushContext } from "../types/catalogPushContext.js";
import { sendCatalogToAtom } from "./sendCatalogToAtom.js";

/** An org's whole shared catalog into every Atom its customers can be in, as Postgres holds it now. */
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
	const atomConnections = orgToAtomTargets({
		shadowAtomConfig: ctx.shadowAtomConfig.get(),
		org: orgWithFeatures.org,
		env,
	});
	if (atomConnections.length === 0) return;

	// Taken before the read: a catalog change that lands during it must still count as newer.
	const readAt = Date.now();
	const envelope = await getSharedCatalogRows({
		ctx: { db: ctx.db, orgId, env },
	});
	const rows = catalogRowsEnvelopeToCatalogRows({ envelope });
	await Promise.all(
		atomConnections.map((atomConnection) =>
			sendCatalogToAtom({ ctx, atomConnection, rows, readAt, orgId }),
		),
	);
};
