import {
	type CatalogKey,
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
	type MeteringIdentity,
} from "@autumn/balance-engine";
import type { CatalogRowsEnvelope } from "@autumn/postgres";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { snapshotCatalogVersions } from "./catalogVersions.js";
import { putCatalogRows } from "./putCatalogRows.js";

const idsOf = ({
	keys,
	table,
}: {
	keys: CatalogKey[];
	table: CatalogKey["table"];
}): string[] => keys.filter((key) => key.table === table).map((key) => key.id);

const envelopeToCatalogRows = ({
	envelope,
}: {
	envelope: CatalogRowsEnvelope;
}): CatalogRow[] => [
	...envelope.entitlements.map(
		(row): CatalogRow => ({ table: "entitlements", row }),
	),
	...envelope.products.map((row): CatalogRow => ({ table: "products", row })),
	...envelope.features.map((row): CatalogRow => ({ table: "features", row })),
	...envelope.prices.map((row): CatalogRow => ({ table: "prices", row })),
	...envelope.plan_licenses.map(
		(row): CatalogRow => ({ table: "planLicenses", row }),
	),
	...envelope.free_trials.map(
		(row): CatalogRow => ({ table: "freeTrials", row }),
	),
];

const fetchAndPut = async ({
	scope,
	identity,
	keys,
}: {
	scope: CatalogCacheScope;
	identity: MeteringIdentity;
	keys: CatalogKey[];
}): Promise<CatalogRow[]> => {
	// Stamped with the versions from before the read: an invalidation during it leaves these rows stale.
	const versionOf = snapshotCatalogVersions({
		scope,
		orgId: identity.orgId,
		env: identity.env,
	});
	const envelope = await scope.ctx.db.getCatalogRows({
		identity,
		ids: {
			entitlementIds: idsOf({ keys, table: "entitlements" }),
			productInternalIds: idsOf({ keys, table: "products" }),
			featureInternalIds: idsOf({ keys, table: "features" }),
			priceIds: idsOf({ keys, table: "prices" }),
			planLicenseIds: idsOf({ keys, table: "planLicenses" }),
			freeTrialIds: idsOf({ keys, table: "freeTrials" }),
		},
	});
	const rows = envelopeToCatalogRows({ envelope });
	putCatalogRows({ scope, rows, versionOf });
	return rows;
};

/** Keys with a fetch already in flight join it, so a burst of misses on one customer costs one round trip.
 *  Returns the rows read for `keys`, which answer this call even if an invalidation has since made them stale. */
export const loadCatalogRows = async ({
	scope,
	identity,
	keys,
}: {
	scope: CatalogCacheScope;
	identity: MeteringIdentity;
	keys: CatalogKey[];
}): Promise<CatalogRow[]> => {
	const { inFlight } = scope.state;
	const joined: Promise<CatalogRow[]>[] = [];
	const toFetch: CatalogKey[] = [];
	for (const key of keys) {
		const pending = inFlight.get(catalogKeyToString({ key }));
		if (pending) joined.push(pending);
		else toFetch.push(key);
	}

	if (toFetch.length > 0) {
		const fetch = fetchAndPut({ scope, identity, keys: toFetch }).finally(
			() => {
				for (const key of toFetch) inFlight.delete(catalogKeyToString({ key }));
			},
		);
		for (const key of toFetch) inFlight.set(catalogKeyToString({ key }), fetch);
		joined.push(fetch);
	}

	const requested = new Set(keys.map((key) => catalogKeyToString({ key })));
	return (await Promise.all(joined))
		.flat()
		.filter((row) =>
			requested.has(
				catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
			),
		);
};
