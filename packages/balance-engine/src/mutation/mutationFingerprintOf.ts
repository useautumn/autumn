import { trackFingerprintOf } from "../commands/track/trackCommandFingerprintOf.js";
import {
	canonicalizeJsonValue,
	type JsonValue,
} from "../models/common/json.js";
import type { MutationCommand } from "../models/customerStateMutation.js";
import type { MeteringIdentity } from "../models/meteringIdentity.js";
import type { RowChange } from "../models/rowChange.js";

type FingerprintInputs = {
	identity: MeteringIdentity;
	command: MutationCommand;
	changes: RowChange[];
};

/** What a retry must match: each command decides which of its inputs count. */
export const mutationFingerprintOf = ({
	mutation,
}: {
	mutation: FingerprintInputs;
}): string => {
	const { identity, command, changes } = mutation;
	if (command.type === "track")
		return trackFingerprintOf({ identity, command });

	const payload: JsonValue = JSON.parse(
		JSON.stringify([identity, { type: command.type }, changes]),
	);

	return JSON.stringify(canonicalizeJsonValue(payload));
};
