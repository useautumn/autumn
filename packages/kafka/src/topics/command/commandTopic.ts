import {
	meteringIdentityToPartitionKey,
	parseConfirmExpiredLockCommand,
	parseFinalizeCommand,
	parseInitializeCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { InvalidRecordError } from "../../lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
	serializeTopicRecord,
} from "../../lib/topicEnvelope.js";
import type {
	TopicRecordEnvelope,
	TopicSchema,
} from "../../lib/types/topicSchema.js";
import type { CommandRecord } from "./types/commandRecord.js";

/** Same key as the metering log, so a command lands on the partition its mutation will. */
function commandRecordToKey({ record }: { record: CommandRecord }): string {
	return meteringIdentityToPartitionKey({ identity: record.identity });
}

function parseCommandPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): CommandRecord {
	try {
		switch (type) {
			case "track":
				return parseTrackCommand({ input: payload });
			case "initialize":
				return parseInitializeCommand({ input: payload });
			case "finalize":
				return parseFinalizeCommand({ input: payload });
			case "confirmExpiredLock":
				return parseConfirmExpiredLockCommand({ input: payload });
			default:
				throw new InvalidRecordError();
		}
	} catch (cause) {
		throw cause instanceof InvalidRecordError
			? cause
			: new InvalidRecordError({ cause });
	}
}

export function serializeCommandRecord({ record }: { record: CommandRecord }): {
	key: Buffer;
	value: Buffer;
} {
	return serializeTopicRecord({
		key: commandRecordToKey({ record }),
		record,
	});
}

export function parseCommandRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): CommandRecord {
	const envelope = readTopicEnvelope({ value });
	const record = parseCommandPayload(envelope);
	assertTopicRecordKey({ key, expectedKey: commandRecordToKey({ record }) });
	return record;
}

export const commandTopic: TopicSchema<CommandRecord> = {
	keyOf: commandRecordToKey,
	parse: parseCommandRecord,
	serialize: serializeCommandRecord,
};
