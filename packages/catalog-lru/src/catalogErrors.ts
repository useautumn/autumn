import { type CatalogKey, catalogKeyToString } from "@autumn/balance-engine";

export class CatalogRowsNotFoundError extends Error {
	readonly keys: CatalogKey[];

	constructor({ keys }: { keys: CatalogKey[] }) {
		const named = keys.map((key) => catalogKeyToString({ key })).join(", ");
		super(`Catalog rows not found: ${named}`);
		this.name = "CatalogRowsNotFoundError";
		this.keys = keys;
	}
}
