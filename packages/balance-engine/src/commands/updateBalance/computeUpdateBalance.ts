import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import { isPaidAllocatedV1Deduction } from "../../deduction/utils/classifyDeductionUtils.js";
import { UnsupportedCommandError } from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { setBalance } from "./steps/setBalance.js";
import { setExpiresAt } from "./steps/setExpiresAt.js";
import { setIncludedGrant } from "./steps/setIncludedGrant.js";
import { setNextResetAt } from "./steps/setNextResetAt.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";
import {
	assertBalanceExists,
	assertBalanceMutable,
} from "./updateBalanceGuards.js";

/** Every field of a balance update in one mutation; null when nothing moves, so nothing is written. */
export const computeUpdateBalance = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): SubjectStateMutation | null => {
	assertCommandSupported({ fullSubject, command });
	const movesBalance =
		command.remaining !== undefined ||
		command.usage !== undefined ||
		command.addToBalance !== undefined;
	// Legacy counts a grant edit as a balance change; date edits skip both guards.
	const changesBalance = movesBalance || command.includedGrant !== undefined;
	if (changesBalance) {
		assertBalanceMutable({ fullSubject, command });
		assertBalanceExists({ fullSubject, command });
	}

	const balanceOutcome = movesBalance
		? setBalance({ fullSubject, command })
		: null;
	if (balanceOutcome && isPaidAllocatedV1Deduction({ outcome: balanceOutcome }))
		throw new UnsupportedCommandError({
			reason: "paid_allocated_not_supported",
		});

	// Any refusal above or below throws, so the fields land together or not at all.
	const changes = [
		...(balanceOutcome?.changes ?? []),
		...setIncludedGrant({ fullSubject, command }),
		...setNextResetAt({ fullSubject, command }),
		...setExpiresAt({ fullSubject, command }),
	];
	if (changes.length === 0) return null;

	return {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: {
			before: fullSubject.revision,
			after: fullSubject.revision + 1,
		},
		command,
		changes,
		result: { type: "updateBalance", deltas: balanceOutcome?.deltas ?? [] },
	};
};
