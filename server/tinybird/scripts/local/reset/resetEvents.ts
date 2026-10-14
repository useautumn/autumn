import {
	listDatasourceNames,
	truncateDatasource,
} from "../lib/tinybirdHttp.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";

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
