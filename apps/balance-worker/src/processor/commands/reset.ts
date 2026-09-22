import { parseResetCommand, type ResetCommand } from "@autumn/balance-engine";
import type { ResetReply } from "@autumn/balance-worker-client/protocol";
import { decideReset } from "../actions/ensureSubjectCurrent/advanceResets.js";
import { readResetInputs } from "../actions/ensureSubjectCurrent/readResetInputs.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** The explicit reset: what every command does implicitly first, sent on its own by the cron or a writer about to read Postgres. */
export async function reset({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ResetCommand;
}): Promise<ResetReply> {
	const { ctx } = scope;
	const parsed = parseResetCommand({ input: command });
	const durability = parsed.durability ?? "log";
	await ctx.subjectHydrator.ensure({ identity: parsed.identity });
	const inputs = await readResetInputs({ scope, command: parsed });
	const anchored: ResetCommand = { ...parsed, ...inputs };

	const decided = ctx.writer.decide<ResetReply>({
		command: anchored,
		durability,
		mutate: ({ state }) => decideReset({ scope, state, command: anchored }),
	});
	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) {
		// Nothing due now, but a "store" caller reads Postgres next: earlier records must have landed first.
		if (durability === "store") await decided.waitForStore();
		return committed;
	}
	if (committed.mutation.result.type !== "reset") {
		throw new Error(
			`Reset ${committed.mutation.id} committed a non-reset record`,
		);
	}
	return { result: committed.mutation.result };
}
