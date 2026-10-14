import type { CatalogRow } from "@autumn/balance-engine";
import type { EntitlementWithFeature } from "@autumn/shared";

export const entitlementCatalogRows = ({
	entitlements,
}: {
	entitlements: EntitlementWithFeature[];
}): CatalogRow[] =>
	[
		...new Map(
			entitlements.map((entitlement) => [entitlement.id, entitlement]),
		).values(),
	].flatMap((entitlement): CatalogRow[] => [
		{ table: "entitlements", row: entitlement },
		{ table: "features", row: entitlement.feature },
	]);
