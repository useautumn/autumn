import type { CustomerState } from "../../models/customerState.js";
import type { CustomerStateMutation } from "../../models/customerStateMutation.js";
import type { RowChange } from "../../models/rowChange.js";
import { mutationFingerprintOf } from "../../mutation/mutationFingerprintOf.js";
import { parseCustomerStateMutation } from "../../parsers.js";
import type {
	InitializeCommand,
	InitializeCommandEcho,
} from "./types/initializeCommand.js";

const byId = <Row extends { id: string }>(rows: Row[]): Row[] =>
	[...rows].sort((left, right) => left.id.localeCompare(right.id));

/** Table order is referential (products before their entitlements); row order is the fingerprint. */
const insertChangesOf = ({ state }: { state: CustomerState }): RowChange[] => [
	...byId(state.customerProducts).map(
		(row): RowChange => ({ table: "customerProducts", op: "insert", row }),
	),
	...[...state.entities]
		.sort((left, right) => left.internal_id.localeCompare(right.internal_id))
		.map((row): RowChange => ({ table: "entities", op: "insert", row })),
	...byId(state.customerEntitlements).map(
		(row): RowChange => ({ table: "customerEntitlements", op: "insert", row }),
	),
	...byId(state.rollovers).map(
		(row): RowChange => ({ table: "rollovers", op: "insert", row }),
	),
];

export const computeInitialize = ({
	command,
	deduplicationExpiresAt,
}: {
	command: InitializeCommand;
	deduplicationExpiresAt: number;
}): CustomerStateMutation => {
	const changes = insertChangesOf({ state: command.state });
	const mutationCommand: InitializeCommandEcho = {
		type: "initialize",
		requestId: command.requestId,
		occurredAt: command.occurredAt,
	};

	return parseCustomerStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: 0, after: 1 },
			command: mutationCommand,
			changes,
			result: { type: "initialize" },
			receipt: {
				fingerprint: mutationFingerprintOf({
					mutation: {
						identity: command.identity,
						command: mutationCommand,
						changes,
					},
				}),
				expiresAt: deduplicationExpiresAt,
			},
		},
	});
};
