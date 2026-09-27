import type { RowChange } from "../../models/mutation/rowChange.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import type { InitializeCommand } from "./types/initializeCommand.js";

const byId = <Row extends { id: string }>(rows: Row[]): Row[] =>
	[...rows].sort((left, right) => left.id.localeCompare(right.id));

/** The subject first, then its tables in referential order; row order within a table is by id. */
const insertChangesOf = ({ state }: { state: SubjectState }): RowChange[] => [
	{ table: "customer", op: "insert", row: state.customer },
	...(state.entity
		? [{ table: "entity", op: "insert", row: state.entity } as const]
		: []),
	...byId(state.customerProducts).map(
		(row): RowChange => ({ table: "customerProducts", op: "insert", row }),
	),
	...byId(state.customerPrices).map(
		(row): RowChange => ({ table: "customerPrices", op: "insert", row }),
	),
	...byId(state.customerEntitlements).map(
		(row): RowChange => ({ table: "customerEntitlements", op: "insert", row }),
	),
	...byId(state.rollovers).map(
		(row): RowChange => ({ table: "rollovers", op: "insert", row }),
	),
	...byId(state.usageWindows).map(
		(row): RowChange => ({ table: "usageWindows", op: "insert", row }),
	),
];

/** A customer initialize creates the state at revision zero; an entity initialize adds the entity's rows to the customer's current revision. */
export const computeInitialize = ({
	command,
	state,
	revisionBefore = 0,
}: {
	command: InitializeCommand;
	state: SubjectState;
	revisionBefore?: number;
}): SubjectStateMutation =>
	parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command,
			changes: insertChangesOf({ state }),
			result: { type: "initialize" },
		},
	});
