import type { RowChange } from "../../models/rowChange.js";
import type { SubjectState } from "../../models/subjectState.js";
import type { SubjectStateMutation } from "../../models/subjectStateMutation.js";
import { mutationFingerprintOf } from "../../mutation/mutationFingerprintOf.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import type {
	InitializeCommand,
	InitializeCommandEcho,
} from "./types/initializeCommand.js";

const byId = <Row extends { id: string }>(rows: Row[]): Row[] =>
	[...rows].sort((left, right) => left.id.localeCompare(right.id));

/** Table order is referential (products before their entitlements); row order is the fingerprint. */
const insertChangesOf = ({ state }: { state: SubjectState }): RowChange[] => [
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
}): SubjectStateMutation => {
	const changes = insertChangesOf({ state: command.state });
	const mutationCommand: InitializeCommandEcho = {
		type: "initialize",
		requestId: command.requestId,
		occurredAt: command.occurredAt,
	};

	return parseSubjectStateMutation({
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
