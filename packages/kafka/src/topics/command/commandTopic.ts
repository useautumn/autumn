import {
	meteringIdentityToPartitionKey,
	parseConfirmExpiredLockCommand,
	parseEvictCommand,
	parseFinalizeCommand,
	parseInbound,
	parseInitializeCommand,
	parseResetCommand,
	parseTrackCommand,
	parseUpdateBalanceCommand,
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
import type { OnUnknownCommandKeys } from "./types/onUnknownCommandKeys.js";

/** Same key as the metering log, so a command lands on the partition its mutation will. */
function commandRecordToKey({ record }: { record: CommandRecord }): string {
	return meteringIdentityToPartitionKey({ identity: record.identity });
}

type CommandParser = (params: { input: unknown }) => CommandRecord;

function commandParserOf({ type }: { type: string }): CommandParser {
	switch (type) {
		case "track":
			return parseTrackCommand;
		case "initialize":
			return parseInitializeCommand;
		case "finalize":
			return parseFinalizeCommand;
		case "confirmExpiredLock":
			return parseConfirmExpiredLockCommand;
		case "reset":
			return parseResetCommand;
		case "evict":
			return parseEvictCommand;
		case "updateBalance":
			return parseUpdateBalanceCommand;
		default:
			throw new InvalidRecordError();
	}
}

function parseCommandPayload({
	type,
	payload,
	onUnknownKeys,
}: Pick<TopicRecordEnvelope, "type" | "payload"> & {
	onUnknownKeys?: OnUnknownCommandKeys;
}): CommandRecord {
	const parse = commandParserOf({ type });
	function reportUnknownKeys({ keyPaths }: { keyPaths: string[] }): void {
		onUnknownKeys?.({ commandType: type, keyPaths });
	}
	try {
		return parseInbound({
			parse,
			input: payload,
			onUnknownKeys: reportUnknownKeys,
		});
	} catch (cause) {
		throw new InvalidRecordError({ cause });
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
	onUnknownKeys,
}: {
	key: Buffer | null;
	value: Buffer | null;
	onUnknownKeys?: OnUnknownCommandKeys;
}): CommandRecord {
	const { type, payload } = readTopicEnvelope({ value });
	const record = parseCommandPayload({ type, payload, onUnknownKeys });
	assertTopicRecordKey({ key, expectedKey: commandRecordToKey({ record }) });
	return record;
}

export const commandTopic: TopicSchema<CommandRecord> = {
	keyOf: commandRecordToKey,
	parse: parseCommandRecord,
	serialize: serializeCommandRecord,
};
