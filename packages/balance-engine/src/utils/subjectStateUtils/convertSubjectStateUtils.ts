import type {
	CusProduct,
	Customer,
	CustomerEntitlement,
	Entity,
	Rollover,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import { workerCustomerSchema } from "../../models/rows/workerCustomer.js";
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
	customer,
	customerProducts,
	customerEntitlements,
	rollovers,
	entity,
}: {
	identity: MeteringIdentity;
	customer: Pick<Customer, "internal_id" | "id" | "config">;
	customerProducts: CusProduct[];
	customerEntitlements: CustomerEntitlement[];
	rollovers: Rollover[];
	entity: Entity | null;
}): SubjectState =>
	createSubjectState({
		identity,
		customer: pickColumns({ schema: workerCustomerSchema, row: customer }),
		customerProducts: customerProducts.map((row) =>
			pickColumns({ schema: workerCustomerProductSchema, row }),
		),
		customerEntitlements: customerEntitlements.map((row) =>
			pickColumns({ schema: workerCustomerEntitlementSchema, row }),
		),
		rollovers: rollovers.map((row) =>
			pickColumns({ schema: workerRolloverSchema, row }),
		),
		entity: entity
			? pickColumns({ schema: workerEntitySchema, row: entity })
			: null,
	});

/**
 * The rows a subject view is stored as: customer-level rows under the customer's identity,
 * and the entity with its own rows under its identity. Rollovers follow their customer entitlement.
 */
export const splitSubjectState = ({
	state,
}: {
	state: SubjectState;
}): { customer: SubjectState; entity: SubjectState | null } => {
	const rowsOwnedBy = ({
		internalEntityId,
	}: {
		internalEntityId: string | null;
	}) => {
		const customerProducts = state.customerProducts.filter(
			(row) => row.internal_entity_id === internalEntityId,
		);
		const customerEntitlements = state.customerEntitlements.filter(
			(row) => row.internal_entity_id === internalEntityId,
		);
		const entitlementIds = new Set(customerEntitlements.map((row) => row.id));
		const rollovers = state.rollovers.filter((rollover) =>
			entitlementIds.has(rollover.cus_ent_id),
		);
		return { customerProducts, customerEntitlements, rollovers };
	};

	return {
		customer: {
			...state,
			identity: { ...state.identity, entityId: null },
			...rowsOwnedBy({ internalEntityId: null }),
			entity: null,
		},
		entity: state.entity
			? {
					...state,
					identity: { ...state.identity, entityId: state.entity.id },
					...rowsOwnedBy({ internalEntityId: state.entity.internal_id }),
				}
			: null,
	};
};

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
				customerEntitlements: [
					...customer.customerEntitlements,
					...entity.customerEntitlements,
				],
				rollovers: [...customer.rollovers, ...entity.rollovers],
			}
		: customer;
