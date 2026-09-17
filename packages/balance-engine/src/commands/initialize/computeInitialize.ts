import type { RowChange } from "../../models/rowChange.js";
import type { SubjectState } from "../../models/subjectState.js";
import type { SubjectStateMutation } from "../../models/subjectStateMutation.js";
import { mutationToFingerprint } from "../../mutation/mutationToFingerprint.js";
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
	...byId(state.customerEntitlements).map(
		(row): RowChange => ({ table: "customerEntitlements", op: "insert", row }),
	),
	...byId(state.rollovers).map(
		(row): RowChange => ({ table: "rollovers", op: "insert", row }),
	),
];

const echoOf = ({
	command,
}: {
	command: InitializeCommand;
}): InitializeCommandEcho => ({
	type: "initialize",
	requestId: command.requestId,
	occurredAt: command.occurredAt,
	customer: command.state.customer,
	entity: command.state.entity,
});

/** Lets a writer fingerprint the command before it knows the revision; equals the mutation's receipt fingerprint. */
export const initializeCommandToFingerprint = ({
	command,
}: {
	command: InitializeCommand;
}): string =>
	mutationToFingerprint({
		mutation: {
			identity: command.identity,
			command: echoOf({ command }),
			changes: insertChangesOf({ state: command.state }),
		},
	});

/** A customer initialize creates the state at revision zero; an entity initialize adds the entity's rows to the customer's current revision. */
export const computeInitialize = ({
	command,
	revisionBefore = 0,
	deduplicationExpiresAt,
}: {
	command: InitializeCommand;
	revisionBefore?: number;
	deduplicationExpiresAt: number;
}): SubjectStateMutation => {
	const changes = insertChangesOf({ state: command.state });
	const mutationCommand = echoOf({ command });

	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command: mutationCommand,
			changes,
			result: { type: "initialize" },
			receipt: {
				fingerprint: mutationToFingerprint({
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
