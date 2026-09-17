import { trackInputsToFingerprint } from "../commands/track/trackCommandToFingerprint.js";
import {
	canonicalizeJsonValue,
	type JsonValue,
} from "../models/common/json.js";
import type { MeteringIdentity } from "../models/meteringIdentity.js";
import type { RowChange } from "../models/rowChange.js";
import type { MutationCommand } from "../models/subjectStateMutation.js";

type FingerprintInputs = {
	identity: MeteringIdentity;
	command: MutationCommand;
	changes: RowChange[];
};

/** What a retry must match: each command decides which of its inputs count. */
export const mutationToFingerprint = ({
	mutation,
}: {
	mutation: FingerprintInputs;
}): string => {
	const { identity, command, changes } = mutation;
	if (command.type === "track")
		return trackInputsToFingerprint({ identity, command });

	const payload: JsonValue = JSON.parse(
		JSON.stringify([identity, { type: command.type }, changes]),
	);

	return JSON.stringify(canonicalizeJsonValue(payload));
};
