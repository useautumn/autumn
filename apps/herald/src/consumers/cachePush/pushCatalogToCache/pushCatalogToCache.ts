import { orgToAtomTargets } from "@autumn/byoc/subjects";
import { catalogRowsEnvelopeToCatalogRows } from "@autumn/catalog-lru";
import { getOrgWithFeatures, getSharedCatalogRows } from "@autumn/postgres";
import type { AppEnv } from "@autumn/shared";
import type { CatalogPushContext } from "../types/catalogPushContext.js";
import { sendCatalogToAtom } from "./sendCatalogToAtom.js";

export const pushCatalogToCache = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: CatalogPushContext;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	const orgWithFeatures = await getOrgWithFeatures({ ctx, orgId, env });
	if (!orgWithFeatures) return;
	const atomConnections = orgToAtomTargets({
		shadowAtomConfig: ctx.shadowAtomConfig.get(),
		org: orgWithFeatures.org,
		env,
		orgAtomsOverQueue: ctx.atomPushQueueOnly,
	});
	if (atomConnections.length === 0) return;

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
