import type { CustomerStateMutation } from "../../models/customerStateMutation.js";
import type { RowChange } from "../../models/rowChange.js";
import { mutationFingerprintOf } from "../../mutation/mutationFingerprintOf.js";
import { parseCustomerStateMutation } from "../../parsers.js";
import type {
	InitializeCommand,
	InitializeCommandEcho,
} from "./types/initializeCommand.js";

/** Row order is the fingerprint, so the same rows always fingerprint the same way. */
const insertChangesOf = ({
	command,
}: {
	command: InitializeCommand;
}): RowChange[] =>
	Object.values(command.state.customerEntitlements)
		.sort(({ id: left }, { id: right }) =>
			left < right ? -1 : left > right ? 1 : 0,
		)
		.map((customerEntitlement) => ({
			table: "customerEntitlements",
			op: "insert",
			row: customerEntitlement,
		}));

export const computeInitialize = ({
	command,
	deduplicationExpiresAt,
}: {
	command: InitializeCommand;
	deduplicationExpiresAt: number;
}): CustomerStateMutation => {
	const changes = insertChangesOf({ command });
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
