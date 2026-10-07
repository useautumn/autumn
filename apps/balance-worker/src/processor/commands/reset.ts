import type { ResetCommand } from "@autumn/balance-engine";
import type { ResetReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { mutateReset } from "../actions/ensureSubjectCurrent/advanceResets.js";
import { readResetInputs } from "../actions/ensureSubjectCurrent/readResetInputs.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { DecidedMutation } from "../writer/types/mutation.js";

/** Every explicit reset, sync or queued, refills here: what each command does implicitly first, sent on its own by the cron or a writer about to read Postgres. */
export async function decideReset({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ResetCommand;
}): Promise<DecidedMutation<ResetReply>> {
	const { ctx } = scope;
	await ctx.subjectHydrator.ensure({ identity: command.identity });
	const inputs = await readResetInputs({ scope, command });
	const anchored: ResetCommand = { ...command, ...inputs };

	return ctx.writer.decide<ResetReply>({
		command: anchored,
		durability: command.durability ?? "log",
		mutate: ({ state }) =>
			timeSync({ label: "reset.decide" }, () =>
				mutateReset({ scope, state, command: anchored }),
			),
	});
}

/** Sync: decide, then answer once the refill is committed. */
export async function reset({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ResetCommand;
}): Promise<ResetReply> {
	const decided = await decideReset({ scope, command });
	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) {
		// Nothing due now, but a "store" caller reads Postgres next: earlier records must have landed first.
		if (command.durability === "store") await decided.waitForStore();
		return committed;
	}
	if (committed.mutation.result.type !== "reset") {
		throw new Error(
			`Reset ${committed.mutation.id} committed a non-reset record`,
		);
	}
	return { result: committed.mutation.result };
}
