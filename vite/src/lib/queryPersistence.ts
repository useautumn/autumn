import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";

export const queryPersister = createAsyncStoragePersister({
	key: "autumn-dashboard-queries",
	storage: { getItem: get, setItem: set, removeItem: del },
	throttleTime: 1000,
});

export const PERSISTED_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

// Catalog and org config only: customer data never leaves memory.
const PERSISTED_ROOTS = new Set([
	"features",
	"rewards",
	"products",
	"product",
	"product_counts",
]);

/** ["org", env, orgId] or its sandbox form, not the ["org", id, "stripe" | "sso"] sub-queries. */
const isOrgQuery = (key: readonly unknown[]) =>
	key[0] === "org" && (key.length === 3 || key[3] === "sandbox");

export const shouldPersistQuery = (query: Query) =>
	query.state.status === "success" &&
	(PERSISTED_ROOTS.has(query.queryKey[0] as string) ||
		isOrgQuery(query.queryKey));
