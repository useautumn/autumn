import { AsyncLocalStorage } from "node:async_hooks";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const autocommitDb = new AsyncLocalStorage<DrizzleCli>();

export const getScopedAutocommitDb = (): DrizzleCli | undefined =>
	autocommitDb.getStore();

export const withAutocommitDb = <T>({
	db,
	run,
}: {
	db: DrizzleCli;
	run: () => Promise<T>;
}): Promise<T> => autocommitDb.run(db, run);
