import { Decimal } from "decimal.js";
import { canonicalizeJsonValue } from "../../models/common/json.js";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import type { TrackCommand, TrackCommandEcho } from "./types/trackCommand.js";

// Retries repeat the request, not its envelope: requestId and occurredAt stay out.
export const trackInputsToFingerprint = ({
	identity,
	command,
}: {
	identity: MeteringIdentity;
	command: Pick<
		TrackCommandEcho,
		"featureId" | "value" | "overageBehavior" | "properties"
	>;
}): string =>
	JSON.stringify([
		identity.orgId,
		identity.env,
		identity.customerId,
		identity.entityId,
		command.featureId,
		new Decimal(command.value).toString(),
		command.overageBehavior,
		command.properties && Object.keys(command.properties).length > 0
			? canonicalizeJsonValue(command.properties)
			: null,
	]);

/** Lets a writer fingerprint a command before deciding; equals the mutation's receipt fingerprint. */
export const trackCommandToFingerprint = ({
	command,
}: {
	command: TrackCommand;
}): string => trackInputsToFingerprint({ identity: command.identity, command });
