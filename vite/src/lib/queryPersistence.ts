import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { millisecondsInSecond, millisecondsInWeek } from "date-fns/constants";
import { del, get, set } from "idb-keyval";

/** Opt a query into the IndexedDB cache. Catalog and org config only: customer data never leaves memory. */
export const PERSIST_META = { persist: true };

export const queryPersistOptions: Omit<
	PersistQueryClientOptions,
	"queryClient"
> = {
	persister: createAsyncStoragePersister({
		key: "autumn-dashboard-queries",
		storage: { getItem: get, setItem: set, removeItem: del },
		throttleTime: millisecondsInSecond,
	}),
	maxAge: millisecondsInWeek,
	// The entry chunk's hashed URL changes every deploy, so a new build never reads an old cache shape.
	buster: import.meta.url,
	dehydrateOptions: {
		shouldDehydrateQuery: (query) =>
			defaultShouldDehydrateQuery(query) && query.meta?.persist === true,
	},
};
