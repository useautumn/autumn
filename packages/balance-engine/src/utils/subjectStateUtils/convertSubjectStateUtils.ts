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
	customerProducts: (Omit<CusProduct, "api_semver"> & {
		api_semver: string | null;
	})[];
	customerPrices: CustomerPrice[];
	customerEntitlements: CustomerEntitlement[];
	rollovers: Rollover[];
	replaceables?: WorkerReplaceableInput[];
	usageWindows: UsageWindow[];
	openLocks?: OpenLock[];
	pooledBalances?: PooledBalance[];
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

const rowsOwnedBy = ({
	state,
	internalEntityId,
}: {
	state: SubjectState;
	internalEntityId: string | null;
}) => {
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
