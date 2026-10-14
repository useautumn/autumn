import { UnsupportedCommandError } from "../../errors.js";
import type { BaseCommand } from "../../models/command/baseCommand.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { isSameCustomerIdentity } from "../../utils/identityUtils/classifyIdentityUtils.js";

export const assertCommandSupported = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: Pick<BaseCommand, "identity">;
}): void => {
	if (
		!isSameCustomerIdentity({
			left: fullSubject.identity,
			right: command.identity,
		})
	) {
		throw new UnsupportedCommandError({ reason: "subject_mismatch" });
	}
	if (command.identity.entityId && !fullSubject.entity) {
		throw new UnsupportedCommandError({ reason: "entity_not_found" });
	}
};
