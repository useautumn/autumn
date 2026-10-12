import {
	listDatasourceNames,
	truncateDatasource,
} from "../lib/tinybirdHttp.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";

/** Truncates `events` and every rollup fed from it; truncating `events` alone leaves the MVs full. */
export const resetEvents = async ({ target }: { target: TinybirdTarget }) => {
	const names = (await listDatasourceNames({ target })).filter((name) =>
		/^events?(_|$)/.test(name),
	);
	for (const name of names) {
		await truncateDatasource({ target, name });
		console.error(`  truncated ${name}`);
	}
	console.log(`reset: truncated ${names.length} datasources`);
};
