import type {
	CusProduct,
	Customer,
	CustomerEntitlement,
	CustomerPrice,
	Entity,
	PooledBalance,
	Rollover,
	UsageWindow,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";
import {
	customerRenderedColumns,
	workerCustomerSchema,
} from "../../models/subject/rows/workerCustomer.js";
import {
	customerEntitlementRenderedColumns,
	workerCustomerEntitlementSchema,
} from "../../models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerPriceSchema } from "../../models/subject/rows/workerCustomerPrice.js";
import {
	customerProductRenderedColumns,
	workerCustomerProductSchema,
} from "../../models/subject/rows/workerCustomerProduct.js";
import {
	entityRenderedColumns,
	type WorkerEntity,
	workerEntitySchema,
} from "../../models/subject/rows/workerEntity.js";
import type { OpenLock } from "../../models/subject/rows/workerLock.js";
import { workerPooledBalanceSchema } from "../../models/subject/rows/workerPooledBalance.js";
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

const withoutColumns = <Row extends object>({
	row,
	columns,
}: {
	row: Row;
	columns: Record<string, true>;
}): Row =>
	Object.fromEntries(
		Object.entries(row).filter(([column]) => !(column in columns)),
	) as Row;

/** The state as the log snapshots it: the columns commands decide on, without what only `customers.get` renders. */
export const subjectStateToLogState = ({
	state,
}: {
	state: SubjectState;
}): SubjectState => ({
	...state,
	customer: withoutColumns({
		row: state.customer,
		columns: customerRenderedColumns,
	}),
	customerProducts: state.customerProducts.map((row) =>
		withoutColumns({ row, columns: customerProductRenderedColumns }),
	),
	customerEntitlements: state.customerEntitlements.map((row) =>
		withoutColumns({ row, columns: customerEntitlementRenderedColumns }),
	),
	entity: state.entity
		? withoutColumns({ row: state.entity, columns: entityRenderedColumns })
		: null,
});

/** The one definition of "a customer's state from its rows"; the server's initialize and the worker's hydration both call it. */
export const customerRowsToSubjectState = ({
	identity,
	customer,
	customerProducts,
	customerPrices,
	customerEntitlements,
	rollovers,
	usageWindows,
	openLocks = [],
	pooledBalances = [],
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
	usageWindows: UsageWindow[];
	/** Absent when the rows come from the server's FullSubject, which does not carry locks. */
	openLocks?: OpenLock[];
	/** The pools behind the customer's pooled rows, as Postgres returns them. */
	pooledBalances?: PooledBalance[];
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
		usageWindows: usageWindows.map((row) =>
			pickColumns({ schema: workerUsageWindowSchema, row }),
		),
		openLocks,
		pooledBalances: pooledBalances.map((row) =>
			pickColumns({ schema: workerPooledBalanceSchema, row }),
		),
		entity: entity
			? pickColumns({ schema: workerEntitySchema, row: entity })
			: null,
	});

/** The rows one owner holds in a view: its products and grants by `internal_entity_id`, prices and rollovers following them. */
const rowsOwnedBy = ({
	state,
	internalEntityId,
}: {
	state: SubjectState;
	internalEntityId: string | null;
}) => {
	const customerProducts = state.customerProducts.filter(
		(row) => row.internal_entity_id === internalEntityId,
	);
	const productIds = new Set(customerProducts.map((row) => row.id));
	const customerPrices = state.customerPrices.filter((row) =>
		productIds.has(row.customer_product_id),
	);
	const customerEntitlements = state.customerEntitlements.filter(
		(row) => row.internal_entity_id === internalEntityId,
	);
	const entitlementIds = new Set(customerEntitlements.map((row) => row.id));
	const rollovers = state.rollovers.filter((rollover) =>
		entitlementIds.has(rollover.cus_ent_id),
	);
	return {
		customerProducts,
		customerPrices,
		customerEntitlements,
		rollovers,
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
});

/**
 * The rows a subject view is stored as: customer-level rows under the customer's identity,
 * and the entity with its own rows under its identity. Rollovers follow their customer entitlement.
 */
export const splitSubjectState = ({
	state,
}: {
	state: SubjectState;
}): { customer: SubjectState; entity: SubjectState | null } => ({
	customer: customerPartOf({ state }),
	entity: state.entity ? entityPartOf({ state, entity: state.entity }) : null,
});

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
				usageWindows: [...customer.usageWindows, ...entity.usageWindows],
				pooledBalances: [...customer.pooledBalances, ...entity.pooledBalances],
			}
		: customer;
