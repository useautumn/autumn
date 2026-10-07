import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
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

const QUEUED_COMMAND_TYPES: ReadonlySet<string> = new Set([
	"track",
	"initialize",
	"finalize",
	"confirmExpiredLock",
	"reset",
	"evict",
	"updateBalance",
] satisfies CommandRecord["type"][]);

/** Cast, not parsed: our server built and validated it, and a newer server's field must not drop the record.
 *  The type is still checked, because the consumer routes on it. */
function parseCommandPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): CommandRecord {
	const command = payload as Partial<CommandRecord> | null;
	if (
		!QUEUED_COMMAND_TYPES.has(type) ||
		command?.type !== type ||
		!command.identity
	)
		throw new InvalidRecordError();
	return command as CommandRecord;
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
