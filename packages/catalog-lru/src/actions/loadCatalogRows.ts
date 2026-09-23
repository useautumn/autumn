import {
	type CatalogKey,
	type CatalogRow,
	catalogKeyToString,
	type MeteringIdentity,
} from "@autumn/balance-engine";
import type { CatalogRowsEnvelope } from "@autumn/postgres";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
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
];

const fetchAndPut = async ({
	scope,
	identity,
	keys,
}: {
	scope: CatalogCacheScope;
	identity: MeteringIdentity;
	keys: CatalogKey[];
}): Promise<void> => {
	const envelope = await scope.ctx.db.getCatalogRows({
		identity,
		ids: {
			entitlementIds: idsOf({ keys, table: "entitlements" }),
			productInternalIds: idsOf({ keys, table: "products" }),
			featureInternalIds: idsOf({ keys, table: "features" }),
			priceIds: idsOf({ keys, table: "prices" }),
			planLicenseIds: idsOf({ keys, table: "planLicenses" }),
		},
	});
	putCatalogRows({ scope, rows: envelopeToCatalogRows({ envelope }) });
};

/** Keys with a fetch already in flight join it, so a burst of misses on one customer costs one round trip. */
export const loadCatalogRows = async ({
	scope,
	identity,
	keys,
}: {
	scope: CatalogCacheScope;
	identity: MeteringIdentity;
	keys: CatalogKey[];
}): Promise<void> => {
	const { inFlight } = scope.state;
	const joined: Promise<void>[] = [];
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

	await Promise.all(joined);
};
