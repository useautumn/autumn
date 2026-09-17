import type {
	CusProduct,
	CustomerEntitlement,
	Entity,
	Rollover,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import { workerCustomerEntitlementSchema } from "../../models/rows/workerCustomerEntitlement.js";
import { workerCustomerProductSchema } from "../../models/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../models/rows/workerEntity.js";
import { workerRolloverSchema } from "../../models/rows/workerRollover.js";
import type { SubjectState } from "../../models/subjectState.js";
import { createSubjectState } from "./createSubjectState.js";

/** Keeps only the schema's columns, so a full Postgres row parses against a strict pick. */
const pickColumns = <Schema extends z.ZodObject>({
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
	customerProducts,
	customerEntitlements,
	rollovers,
	entities,
}: {
	identity: MeteringIdentity;
	customerProducts: CusProduct[];
	customerEntitlements: CustomerEntitlement[];
	rollovers: Rollover[];
	entities: Entity[];
}): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: customerProducts.map((row) =>
			pickColumns({ schema: workerCustomerProductSchema, row }),
		),
		customerEntitlements: customerEntitlements.map((row) =>
			pickColumns({ schema: workerCustomerEntitlementSchema, row }),
		),
		rollovers: rollovers.map((row) =>
			pickColumns({ schema: workerRolloverSchema, row }),
		),
		entities: entities.map((row) =>
			pickColumns({ schema: workerEntitySchema, row }),
		),
	});

/**
 * The rows a subject view is stored as: the customer's own rows (internal_entity_id null, plus the
 * entities themselves) under the customer's identity, and each entity's rows under its identity.
 * Rollovers follow the customer entitlement they belong to.
 */
export const subjectStateToSubjectBlobs = ({
	state,
}: {
	state: SubjectState;
}): { customer: SubjectState; entities: SubjectState[] } => {
	const customer: SubjectState = {
		...state,
		identity: { ...state.identity, entityId: null },
		customerProducts: state.customerProducts.filter(
			(row) => row.internal_entity_id === null,
		),
		customerEntitlements: state.customerEntitlements.filter(
			(row) => row.internal_entity_id === null,
		),
		rollovers: [],
	};
	const customerEntitlementIds = new Set(
		customer.customerEntitlements.map((row) => row.id),
	);
	customer.rollovers = state.rollovers.filter((rollover) =>
		customerEntitlementIds.has(rollover.cus_ent_id),
	);

	const entities = state.entities.flatMap((entity): SubjectState[] => {
		const customerEntitlements = state.customerEntitlements.filter(
			(row) => row.internal_entity_id === entity.internal_id,
		);
		const customerProducts = state.customerProducts.filter(
			(row) => row.internal_entity_id === entity.internal_id,
		);
		if (customerEntitlements.length === 0 && customerProducts.length === 0)
			return [];
		const entitlementIds = new Set(customerEntitlements.map((row) => row.id));
		return [
			{
				...state,
				identity: { ...state.identity, entityId: entity.id },
				customerProducts,
				customerEntitlements,
				rollovers: state.rollovers.filter((rollover) =>
					entitlementIds.has(rollover.cus_ent_id),
				),
				entities: [],
			},
		];
	});
	return { customer, entities };
};

/** The view a command computes against: the customer blob, plus one entity's blob when the command names it. */
export const subjectBlobsToSubjectState = ({
	customer,
	entity = null,
}: {
	customer: SubjectState;
	entity?: SubjectState | null;
}): SubjectState =>
	entity
		? {
				...customer,
				customerProducts: [
					...customer.customerProducts,
					...entity.customerProducts,
				],
				customerEntitlements: [
					...customer.customerEntitlements,
					...entity.customerEntitlements,
				],
				rollovers: [...customer.rollovers, ...entity.rollovers],
			}
		: customer;
