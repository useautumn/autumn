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

/** No local state and the source of truth has no such customer, or entity of it, in this org and env. */
export class SubjectNotFoundError extends Error {
	readonly identity: MeteringIdentity;

	constructor({ identity }: { identity: MeteringIdentity }) {
		const subject = identity.entityId
			? `Entity ${identity.entityId} of customer ${identity.customerId}`
			: `Customer ${identity.customerId}`;
		super(`${subject} not found in ${identity.orgId}/${identity.env}`);
		this.name = "SubjectNotFoundError";
		this.identity = identity;
	}
}
