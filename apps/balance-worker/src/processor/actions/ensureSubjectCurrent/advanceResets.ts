import {
	applyMutation,
	computeReset,
	meteringIdentityToPartitionKey,
	type ResetCommand,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { ResetReply } from "@autumn/balance-worker-client/protocol";
import { PartitionProcessorStateNotFoundError } from "../../common/processorErrors.js";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import type { MutationResult } from "../../writer/types/mutation.js";
import type { ResetInputs } from "./readResetInputs.js";

/** What the reset borrows from the command that triggers it: whose clock, and which request to answer to. */
export type TriggeringCommand = Pick<
	TrackCommand,
	"identity" | "occurredAt" | "requestId" | "org"
> & { commandId?: string };

/** The reset a command triggers, id derived from the command's own so a retry reaches the same record. */
const triggerToResetCommand = ({
	command,
	inputs,
}: {
	command: TriggeringCommand;
	inputs: ResetInputs;
}): ResetCommand => ({
	schemaVersion: 1,
	type: "reset",
	commandId: `${command.commandId ?? command.requestId}:reset`,
	requestId: command.requestId,
	identity: command.identity,
	occurredAt: command.occurredAt,
	org: command.org,
	...inputs,
});

/** Runs inside the writer's critical section: no await, no I/O. Nothing due answers without a record. */
export const decideReset = ({
	scope,
	state,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: ResetCommand;
}): MutationResult<ResetReply> => {
	if (!state) {
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		});
	}
	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const mutation = computeReset({ fullSubject, command });
	if (!mutation) return { kind: "reply", reply: { result: null } };
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

/**
 * Rows due by the command's `occurredAt` refill in their own record, so the command lands on the fresh
 * cycle. Synchronous, like the decision it precedes; nothing is written when nothing is due.
 */
export const advanceResets = ({
	scope,
	command,
	inputs,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
	inputs: ResetInputs;
}): void => {
	const reset = triggerToResetCommand({ command, inputs });
	scope.ctx.writer.decide<ResetReply>({
		command: reset,
		mutate: ({ state }) => decideReset({ scope, state, command: reset }),
	});
};
