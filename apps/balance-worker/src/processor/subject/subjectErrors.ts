import {
	type CatalogKey,
	catalogKeyToString,
	type MeteringIdentity,
} from "@autumn/balance-engine";

/** The rows were cached when the subject was ensured and evicted before the decision read them. */
export class SubjectCatalogEvictedError extends Error {
	readonly keys: CatalogKey[];

	constructor({ keys }: { keys: CatalogKey[] }) {
		const named = keys.map((key) => catalogKeyToString({ key })).join(", ");
		super(`Catalog rows evicted before the decision: ${named}`);
		this.name = "SubjectCatalogEvictedError";
		this.keys = keys;
	}
}

/** No local state and the source of truth has no such customer in this org and env. */
export class SubjectNotFoundError extends Error {
	constructor({ identity }: { identity: MeteringIdentity }) {
		super(
			`Customer ${identity.customerId} not found in ${identity.orgId}/${identity.env}`,
		);
		this.name = "SubjectNotFoundError";
	}
}
