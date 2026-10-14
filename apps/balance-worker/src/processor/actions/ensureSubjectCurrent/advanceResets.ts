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

export type TriggeringCommand = Pick<
	TrackCommand,
	"identity" | "occurredAt" | "requestId" | "org"
> & { commandId?: string };

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

export const mutateReset = ({
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
		mutate: ({ state }) => mutateReset({ scope, state, command: reset }),
	});
};
