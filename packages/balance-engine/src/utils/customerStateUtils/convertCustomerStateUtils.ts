import type {
	CusProduct,
	CustomerEntitlement,
	Entity,
	Rollover,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { CustomerState } from "../../models/customerState.js";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import { workerCustomerEntitlementSchema } from "../../models/rows/workerCustomerEntitlement.js";
import { workerCustomerProductSchema } from "../../models/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../models/rows/workerEntity.js";
import { workerRolloverSchema } from "../../models/rows/workerRollover.js";
import { createCustomerState } from "./createCustomerState.js";

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
export const customerRowsToCustomerState = ({
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
}): CustomerState =>
	createCustomerState({
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
