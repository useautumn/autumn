import type { CheckCommand } from "../../commands/check/types/checkCommand.js";
import type { TrackCommand } from "../../commands/track/types/trackCommand.js";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { isSameCustomerIdentity } from "../../utils/identityUtils/classifyIdentityUtils.js";

/** The request-shape guards every command runs before touching balances. */
export const assertCommandSupported = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand | CheckCommand;
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
	if (command.properties && Object.keys(command.properties).length > 0) {
		throw new UnsupportedCommandError({ reason: "properties_not_supported" });
	}
};
