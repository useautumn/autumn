import {
	type CatalogKey,
	catalogKeyToString,
	type MeteringIdentity,
} from "@autumn/balance-engine";

export class SubjectCatalogEvictedError extends Error {
	readonly keys: CatalogKey[];

	constructor({ keys }: { keys: CatalogKey[] }) {
		const named = keys.map((key) => catalogKeyToString({ key })).join(", ");
		super(`Catalog rows evicted before the decision: ${named}`);
		this.name = "SubjectCatalogEvictedError";
		this.keys = keys;
	}
}

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

export class SubjectStaleError extends Error {
	readonly identity: MeteringIdentity;

	constructor({
		identity,
		cause,
	}: {
		identity: MeteringIdentity;
		cause: unknown;
	}) {
		super(
			`Customer ${identity.customerId} changed underneath the decision in ${identity.orgId}/${identity.env}`,
			{ cause },
		);
		this.name = "SubjectStaleError";
		this.identity = identity;
	}
}

export class SubjectLoadOvertakenError extends Error {
	readonly identity: MeteringIdentity;

	constructor({ identity }: { identity: MeteringIdentity }) {
		super(
			`Customer ${identity.customerId} kept changing while it was loaded in ${identity.orgId}/${identity.env}`,
		);
		this.name = "SubjectLoadOvertakenError";
		this.identity = identity;
	}
}

export class SubjectLoadBusyError extends Error {
	readonly identity: MeteringIdentity;

	constructor({ identity }: { identity: MeteringIdentity }) {
		super(
			`Customer ${identity.customerId} was still loading at the caller's deadline in ${identity.orgId}/${identity.env}`,
		);
		this.name = "SubjectLoadBusyError";
		this.identity = identity;
	}
}
