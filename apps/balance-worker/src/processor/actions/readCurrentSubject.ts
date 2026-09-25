import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { Subject } from "../subject/types/subject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { TriggeringCommand } from "./ensureSubjectCurrent/advanceResets.js";
import { ensureSubjectCurrent } from "./ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "./withResidentSubject.js";

/**
 * The subject as the next command would see it: current by the command's clock,
 * every earlier write counted.
 *
 * Reads answer from the projection, which already carries the customer's
 * accepted tracks; they do not wait for those tracks to reach Kafka. Waiting
 * made every read of a busy customer pay the rest of whichever commit was in
 * flight (a median of ~20 ms on the hottest partitions against ~1 ms elsewhere)
 * for a durability guarantee only the track itself needs. A failed commit
 * poisons the partition, so a read after one still fails rather than
 * answering from a projection that never landed.
 */
export const readCurrentSubject = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Promise<Subject> => {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	return withResidentSubject<Subject>({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () => {
			ctx.writer.assertCommitsHealthy();
			ctx.assertCanRead();

			// Null here means an evict landed since ensure; the caller hydrates again.
			const state = ctx.writer.readFreshestState({
				identity: command.identity,
			});
			if (!state) return null;
			return { state, catalog: ctx.subjectHydrator.readCatalog({ state }) };
		},
	});
};
