import { z } from "zod/v4";
import { sightUnknownInput } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";
import {
	type WorkerCustomer,
	workerCustomerSchema,
} from "../subject/rows/workerCustomer.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "../subject/rows/workerCustomerEntitlement.js";
import {
	type WorkerCustomerPrice,
	workerCustomerPriceSchema,
} from "../subject/rows/workerCustomerPrice.js";
import {
	type WorkerCustomerProduct,
	workerCustomerProductSchema,
} from "../subject/rows/workerCustomerProduct.js";
import {
	type WorkerEntity,
	workerEntitySchema,
} from "../subject/rows/workerEntity.js";
import {
	type WorkerLock,
	workerLockSchema,
} from "../subject/rows/workerLock.js";
import {
	type WorkerPooledBalance,
	workerPooledBalanceSchema,
} from "../subject/rows/workerPooledBalance.js";
import {
	type WorkerPooledContribution,
	workerPooledContributionSchema,
} from "../subject/rows/workerPooledContribution.js";
import {
	type WorkerRollover,
	workerRolloverSchema,
} from "../subject/rows/workerRollover.js";
import {
	type WorkerUsageWindow,
	workerUsageWindowSchema,
} from "../subject/rows/workerUsageWindow.js";
import {
	customerEntitlementIncrementParts,
	pooledBalanceIncrementParts,
	type RowIncrement,
	rolloverIncrementParts,
	rowIncrementSchema,
	usageWindowIncrementParts,
} from "./rowIncrement.js";

export type TableRowChange<Table extends string, Row> =
	| { table: Table; op: "insert"; row: Row }
	| {
			table: Table;
			op: "update";
			id: string;
			before: Partial<Row>;
			after: Partial<Row>;
	  }
	| { table: Table; op: "delete"; id: string };

const tableRowChangeOptions = <
	Table extends string,
	RowSchema extends z.ZodObject,
>({
	table,
	rowSchema,
}: {
	table: Table;
	rowSchema: RowSchema;
}) => {
	const tableSchema = z.literal(table);

	return [
		z
			.object({ table: tableSchema, op: z.literal("insert"), row: rowSchema })
			.loose(),
		z
			.object({
				table: tableSchema,
				op: z.literal("update"),
				id: nonEmptyStringSchema,
				before: rowSchema.partial(),
				after: rowSchema.partial(),
			})
			.loose(),
		z
			.object({
				table: tableSchema,
				op: z.literal("delete"),
				id: nonEmptyStringSchema,
			})
			.loose(),
	] as const;
};

const tableRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
}) => z.discriminatedUnion("op", tableRowChangeOptions(params));

const balanceRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
	Add extends z.ZodObject,
	Entries extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
	parts: { add: Add; entries: Entries };
}) =>
	z.discriminatedUnion("op", [
		...tableRowChangeOptions(params),
		rowIncrementSchema(params),
	]);

export type CustomerEntitlementIncrement = RowIncrement<
	"customerEntitlements",
	WorkerCustomerEntitlement,
	z.infer<typeof customerEntitlementIncrementParts.add>,
	z.infer<typeof customerEntitlementIncrementParts.entries>
>;
export type RolloverIncrement = RowIncrement<
	"rollovers",
	WorkerRollover,
	z.infer<typeof rolloverIncrementParts.add>,
	z.infer<typeof rolloverIncrementParts.entries>
>;
export type PooledBalanceIncrement = RowIncrement<
	"pooledBalances",
	WorkerPooledBalance,
	z.infer<typeof pooledBalanceIncrementParts.add>,
	z.infer<typeof pooledBalanceIncrementParts.entries>
>;
export type UsageWindowIncrement = RowIncrement<
	"usageWindows",
	WorkerUsageWindow,
	z.infer<typeof usageWindowIncrementParts.add>,
	z.infer<typeof usageWindowIncrementParts.entries>
>;

export type SubjectRowChange<Table extends string, Row> = {
	table: Table;
	op: "insert";
	row: Row;
};

const subjectRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>({
	table,
	rowSchema,
}: {
	table: Table;
	rowSchema: RowSchema;
}) =>
	z
		.object({
			table: z.literal(table),
			op: z.literal("insert"),
			row: rowSchema,
		})
		.loose();

export type WriteOnceRowChange<Table extends string, Row> = Exclude<
	TableRowChange<Table, Row>,
	{ op: "update" }
>;

const writeOnceRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
}) => {
	const [insert, , remove] = tableRowChangeOptions(params);
	return z.discriminatedUnion("op", [insert, remove]);
};

export type LockRowChange = WriteOnceRowChange<"locks", WorkerLock>;

export type PooledContributionPromote = {
	table: "pooledContributions";
	op: "promote";
	pooledBalanceId: string;
	dueBy: number;
};

export type PooledContributionRowChange =
	| TableRowChange<"pooledContributions", WorkerPooledContribution>
	| PooledContributionPromote;

const pooledContributionRowChangeSchema = () =>
	z.discriminatedUnion("op", [
		...tableRowChangeOptions({
			table: "pooledContributions",
			rowSchema: workerPooledContributionSchema,
		}),
		z
			.object({
				table: z.literal("pooledContributions"),
				op: z.literal("promote"),
				pooledBalanceId: nonEmptyStringSchema,
				dueBy: z.number(),
			})
			.loose(),
	]);

export type CustomerRowChange = Exclude<
	TableRowChange<"customer", WorkerCustomer>,
	{ op: "delete" }
>;

const customerRowChangeSchema = () => {
	const [insert, update] = tableRowChangeOptions({
		table: "customer",
		rowSchema: workerCustomerSchema,
	});
	return z.discriminatedUnion("op", [insert, update]);
};

export type RowChange =
	| CustomerRowChange
	| SubjectRowChange<"entity", WorkerEntity>
	| TableRowChange<"customerProducts", WorkerCustomerProduct>
	| TableRowChange<"customerPrices", WorkerCustomerPrice>
	| TableRowChange<"customerEntitlements", WorkerCustomerEntitlement>
	| CustomerEntitlementIncrement
	| TableRowChange<"rollovers", WorkerRollover>
	| RolloverIncrement
	| TableRowChange<"usageWindows", WorkerUsageWindow>
	| UsageWindowIncrement
	| TableRowChange<"pooledBalances", WorkerPooledBalance>
	| PooledBalanceIncrement
	| PooledContributionRowChange
	| LockRowChange;

export const rowChangeSchema = z.discriminatedUnion("table", [
	customerRowChangeSchema(),
	subjectRowChangeSchema({ table: "entity", rowSchema: workerEntitySchema }),
	tableRowChangeSchema({
		table: "customerProducts",
		rowSchema: workerCustomerProductSchema,
	}),
	tableRowChangeSchema({
		table: "customerPrices",
		rowSchema: workerCustomerPriceSchema,
	}),
	balanceRowChangeSchema({
		table: "customerEntitlements",
		rowSchema: workerCustomerEntitlementSchema,
		parts: customerEntitlementIncrementParts,
	}),
	balanceRowChangeSchema({
		table: "rollovers",
		rowSchema: workerRolloverSchema,
		parts: rolloverIncrementParts,
	}),
	balanceRowChangeSchema({
		table: "usageWindows",
		rowSchema: workerUsageWindowSchema,
		parts: usageWindowIncrementParts,
	}),
	balanceRowChangeSchema({
		table: "pooledBalances",
		rowSchema: workerPooledBalanceSchema,
		parts: pooledBalanceIncrementParts,
	}),
	pooledContributionRowChangeSchema(),
	writeOnceRowChangeSchema({ table: "locks", rowSchema: workerLockSchema }),
]);

export const changesInsertCustomer = ({
	changes,
}: {
	changes: readonly RowChange[];
}): boolean =>
	changes.some(
		(change) => change.table === "customer" && change.op === "insert",
	);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const knownRowChangeKinds: ReadonlySet<string> = new Set(
	rowChangeSchema.options.flatMap((byTable) =>
		("options" in byTable ? byTable.options : [byTable]).map((option) => {
			const { table, op } = (option as z.ZodObject).shape;
			return `${(table as z.ZodLiteral).value}:${(op as z.ZodLiteral).value}`;
		}),
	),
);

export const skipUnknownRowChanges = (input: unknown): unknown => {
	if (!isObject(input) || !Array.isArray(input.changes)) return input;
	const changes = input.changes.filter((change) => {
		if (!isObject(change)) return true;
		const { table, op } = change;
		if (typeof table !== "string" || typeof op !== "string") return true;
		if (knownRowChangeKinds.has(`${table}:${op}`)) return true;
		sightUnknownInput({
			key: `rowChange=${table}:${op}`,
			input: {
				kind: "row_change",
				table,
				op,
				commandId: String(input.id),
				identity: input.identity,
			},
		});
		return false;
	});
	return changes.length === input.changes.length
		? input
		: { ...input, changes };
};
