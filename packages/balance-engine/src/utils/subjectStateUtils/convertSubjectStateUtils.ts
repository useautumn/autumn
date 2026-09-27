import type {
	CusProduct,
	Customer,
	CustomerEntitlement,
	CustomerPrice,
	DbCustomerLicense,
	Entity,
	PooledBalance,
	Rollover,
	UsageWindow,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";
import { workerCustomerSchema } from "../../models/subject/rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "../../models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerLicenseSchema } from "../../models/subject/rows/workerCustomerLicense.js";
import { workerCustomerPriceSchema } from "../../models/subject/rows/workerCustomerPrice.js";
import { workerCustomerProductSchema } from "../../models/subject/rows/workerCustomerProduct.js";
import {
	type WorkerEntity,
	workerEntitySchema,
} from "../../models/subject/rows/workerEntity.js";
import type { OpenLock } from "../../models/subject/rows/workerLock.js";
import { workerPooledBalanceSchema } from "../../models/subject/rows/workerPooledBalance.js";
import {
	type WorkerReplaceableInput,
	workerReplaceableSchema,
} from "../../models/subject/rows/workerReplaceable.js";
import { workerRolloverSchema } from "../../models/subject/rows/workerRollover.js";
import { workerUsageWindowSchema } from "../../models/subject/rows/workerUsageWindow.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { createSubjectState } from "./createSubjectState.js";

/** Keeps only the schema's columns, so a full Postgres row parses against a strict pick. */
export const pickColumns = <Schema extends z.ZodObject>({
	schema,
	row,
}: {
	schema: Schema;
	row: object;
}): z.infer<Schema> =>
	schema.parse(
		Object.fromEntries(
			Object.keys(schema.shape)
				.map((column) => [column, Reflect.get(row, column)])
				.filter(([, value]) => value !== undefined),
		),
	);

/** The one definition of "a customer's state from its rows"; the server's initialize and the worker's hydration both call it. */
export const customerRowsToSubjectState = ({
	identity,
	customer,
	customerProducts,
	customerPrices,
	customerEntitlements,
	rollovers,
	replaceables = [],
	usageWindows,
	openLocks = [],
	pooledBalances = [],
	customerLicenses = [],
	entity,
}: {
	identity: MeteringIdentity;
	customer: Pick<
		Customer,
		| "internal_id"
		| "id"
		| "config"
		| "spend_limits"
		| "overage_allowed"
		| "usage_limits"
	>;
	customerProducts: CusProduct[];
	customerPrices: CustomerPrice[];
	customerEntitlements: CustomerEntitlement[];
	rollovers: Rollover[];
	/** A v1 allocated grant's replaceable seats; absent from rows that never had them. */
	replaceables?: WorkerReplaceableInput[];
	usageWindows: UsageWindow[];
	/** Absent when the rows come from the server's FullSubject, which does not carry locks. */
	openLocks?: OpenLock[];
	/** The pools behind the customer's pooled rows, as Postgres returns them. */
	pooledBalances?: PooledBalance[];
	/** The license pools on the customer's products; absent from a FullSubject built without them. */
	customerLicenses?: DbCustomerLicense[];
	entity: Entity | null;
}): SubjectState =>
	createSubjectState({
		identity,
		customer: pickColumns({ schema: workerCustomerSchema, row: customer }),
		customerProducts: customerProducts.map((row) =>
			pickColumns({ schema: workerCustomerProductSchema, row }),
		),
		customerPrices: customerPrices.map((row) =>
			pickColumns({ schema: workerCustomerPriceSchema, row }),
		),
		customerEntitlements: customerEntitlements.map((row) =>
			pickColumns({ schema: workerCustomerEntitlementSchema, row }),
		),
		rollovers: rollovers.map((row) =>
			pickColumns({ schema: workerRolloverSchema, row }),
		),
		replaceables: replaceables.map((row) =>
			pickColumns({ schema: workerReplaceableSchema, row }),
		),
		usageWindows: usageWindows.map((row) =>
			pickColumns({ schema: workerUsageWindowSchema, row }),
		),
		openLocks,
		pooledBalances: pooledBalances.map((row) =>
			pickColumns({ schema: workerPooledBalanceSchema, row }),
		),
		customerLicenses: customerLicenses.map((row) =>
			pickColumns({ schema: workerCustomerLicenseSchema, row }),
		),
		entity: entity
			? pickColumns({ schema: workerEntitySchema, row: entity })
			: null,
	});

/** A grant's owner is its own `internal_entity_id`, else its product's: an entity plan's grants carry none of their own. */
export const grantOwnerOf = ({
	state,
	row,
}: {
	state: SubjectState;
	row: SubjectState["customerEntitlements"][number];
}): string | null => {
	if (row.internal_entity_id) return row.internal_entity_id;
	const product = state.customerProducts.find(
		({ id }) => id === row.customer_product_id,
	);
	return product?.internal_entity_id ?? null;
};

/** The rows one owner holds in a view: its products and grants, prices and rollovers following them. */
const rowsOwnedBy = ({
	state,
	internalEntityId,
}: {
	state: SubjectState;
	internalEntityId: string | null;
}) => {
	// A plan-inserted row may omit the column; absent means customer-level, as in Postgres.
	const customerProducts = state.customerProducts.filter(
		(row) => (row.internal_entity_id ?? null) === internalEntityId,
	);
	const productIds = new Set(customerProducts.map((row) => row.id));
	const customerPrices = state.customerPrices.filter((row) =>
		productIds.has(row.customer_product_id),
	);
	const customerEntitlements = state.customerEntitlements.filter(
		(row) => grantOwnerOf({ state, row }) === internalEntityId,
	);
	const entitlementIds = new Set(customerEntitlements.map((row) => row.id));
	const rollovers = state.rollovers.filter((rollover) =>
		entitlementIds.has(rollover.cus_ent_id),
	);
	const replaceables = state.replaceables.filter((replaceable) =>
		entitlementIds.has(replaceable.cus_ent_id),
	);
	// A window counts for its own entity or for the customer; left out of the split, both parts
	// kept every window and each merge doubled them, so a windowed entity's state grew by 2^writes.
	const usageWindows = state.usageWindows.filter(
		(row) => (row.internal_entity_id ?? null) === internalEntityId,
	);
	return {
		customerProducts,
		customerPrices,
		customerEntitlements,
		rollovers,
		replaceables,
		usageWindows,
	};
};

const customerPartOf = ({ state }: { state: SubjectState }): SubjectState => ({
	...state,
	identity: { ...state.identity, entityId: null },
	...rowsOwnedBy({ state, internalEntityId: null }),
	entity: null,
});

/** An entity's part of a view: its own rows at the view's revision. A lock id or a pool belongs to the customer. */
const entityPartOf = ({
	state,
	entity,
}: {
	state: SubjectState;
	entity: WorkerEntity;
}): SubjectState => ({
	...state,
	identity: { ...state.identity, entityId: entity.id },
	...rowsOwnedBy({ state, internalEntityId: entity.internal_id }),
	entity,
	openLocks: [],
	pooledBalances: [],
	customerLicenses: [],
});

/**
 * A customer's own view holding nothing its customer part would leave out: no entity, no entity-owned row,
 * no price, rollover or replaceable whose owner row is gone. For such a view the split is the identity.
 */
const isOwnCustomerPart = ({ state }: { state: SubjectState }): boolean => {
	if (state.entity !== null || state.identity.entityId !== null) return false;
	const hasProduct = (id: string) =>
		state.customerProducts.some((row) => row.id === id);
	const hasEntitlement = (id: string) =>
		state.customerEntitlements.some((row) => row.id === id);
	return (
		state.customerProducts.every(
			(row) => (row.internal_entity_id ?? null) === null,
		) &&
		state.customerPrices.every((row) => hasProduct(row.customer_product_id)) &&
		state.customerEntitlements.every(
			(row) => (row.internal_entity_id ?? null) === null,
		) &&
		state.rollovers.every((row) => hasEntitlement(row.cus_ent_id)) &&
		state.replaceables.every((row) => hasEntitlement(row.cus_ent_id)) &&
		state.usageWindows.every((row) => (row.internal_entity_id ?? null) === null)
	);
};

/**
 * The rows a subject view is stored as: customer-level rows under the customer's identity,
 * and the entity with its own rows under its identity. Rollovers follow their customer entitlement.
 * A view with nothing to split out is returned as is, so a cache keyed on the state object still finds it.
 */
export const splitSubjectState = ({
	state,
}: {
	state: SubjectState;
}): { customer: SubjectState; entity: SubjectState | null } => {
	if (isOwnCustomerPart({ state })) return { customer: state, entity: null };
	return {
		customer: customerPartOf({ state }),
		entity: state.entity ? entityPartOf({ state, entity: state.entity }) : null,
	};
};

/** A view spanning the customer and several entities, as each owner stores it. */
export const splitCustomerAndEntities = ({
	state,
	entities,
}: {
	state: SubjectState;
	entities: readonly WorkerEntity[];
}): { customer: SubjectState; entities: SubjectState[] } => ({
	customer: customerPartOf({ state }),
	entities: entities.map((entity) => entityPartOf({ state, entity })),
});

/** What a billing plan computes against: the customer's state with every named entity's own rows beside it. */
export const mergeCustomerAndEntities = ({
	customer,
	entities,
}: {
	customer: SubjectState;
	entities: readonly SubjectState[];
}): SubjectState => ({
	...customer,
	customerProducts: [
		...customer.customerProducts,
		...entities.flatMap((entity) => entity.customerProducts),
	],
	customerPrices: [
		...customer.customerPrices,
		...entities.flatMap((entity) => entity.customerPrices),
	],
	customerEntitlements: [
		...customer.customerEntitlements,
		...entities.flatMap((entity) => entity.customerEntitlements),
	],
	rollovers: [
		...customer.rollovers,
		...entities.flatMap((entity) => entity.rollovers),
	],
	replaceables: [
		...customer.replaceables,
		...entities.flatMap((entity) => entity.replaceables),
	],
	usageWindows: [
		...customer.usageWindows,
		...entities.flatMap((entity) => entity.usageWindows),
	],
});

/** What an entity command computes against: the customer's state plus the entity's own, as one SubjectState. */
export const mergeSubjectStates = ({
	customer,
	entity = null,
}: {
	customer: SubjectState;
	entity?: SubjectState | null;
}): SubjectState =>
	entity
		? {
				...customer,
				identity: entity.identity,
				entity: entity.entity,
				customerProducts: [
					...customer.customerProducts,
					...entity.customerProducts,
				],
				customerPrices: [...customer.customerPrices, ...entity.customerPrices],
				customerEntitlements: [
					...customer.customerEntitlements,
					...entity.customerEntitlements,
				],
				rollovers: [...customer.rollovers, ...entity.rollovers],
				replaceables: [...customer.replaceables, ...entity.replaceables],
				usageWindows: [...customer.usageWindows, ...entity.usageWindows],
				pooledBalances: [...customer.pooledBalances, ...entity.pooledBalances],
			}
		: customer;
