import { type LogEntry, type logCreator, logLevel } from "kafkajs";

/**
 * Refusals a broker hands out in the ordinary course of things, which the
 * client retries on its own: a coordinator still closing the previous
 * transaction, a leader mid-election, a coordinator on the move, a group
 * mid-rebalance. kafkajs logs each one at ERROR, carrying only its message, so
 * they are recognised by that message and lowered. A retry that gives up still
 * surfaces through the caller's own error, which is where a failure is
 * reported; nothing here touches that.
 */
const ROUTINE_REFUSAL_LEVELS: ReadonlyMap<string, logLevel> = new Map([
	[
		"The producer attempted to update a transaction while another concurrent operation on the same transaction was ongoing",
		logLevel.DEBUG,
	],
	["This server is not the leader for that topic-partition", logLevel.DEBUG],
	[
		"There is no leader for this topic-partition as we are in the middle of a leadership election",
		logLevel.DEBUG,
	],
	["The group coordinator is not available", logLevel.DEBUG],
	["This is not the correct coordinator for this group", logLevel.DEBUG],
	[
		"The coordinator is loading and hence can't process requests for this group",
		logLevel.DEBUG,
	],
	["The request timed out", logLevel.WARN],
	["The server disconnected before a response was received", logLevel.WARN],
	["The group is rebalancing, so a rejoin is needed", logLevel.INFO],
]);

export function routineRefusalMessages(): string[] {
	return [...ROUTINE_REFUSAL_LEVELS.keys()];
}

/** The level an entry deserves: kafkajs's own unless it reports a routine refusal. */
function effectiveKafkaLogLevel({ entry }: { entry: LogEntry }): logLevel {
	const refusal = entry.log.error;
	if (typeof refusal !== "string") return entry.level;
	return ROUTINE_REFUSAL_LEVELS.get(refusal) ?? entry.level;
}

/** kafkajs's console format, unchanged, so the lines already read in Axiom keep their shape. */
function formatKafkaLogLine({
	entry,
	level,
}: {
	entry: LogEntry;
	level: logLevel;
}): string {
	const prefix = entry.namespace ? `[${entry.namespace}] ` : "";
	return JSON.stringify({
		level: labelOf({ level }),
		...entry.log,
		message: `${prefix}${entry.log.message}`,
	});
}

function labelOf({ level }: { level: logLevel }): string {
	switch (level) {
		case logLevel.ERROR:
			return "ERROR";
		case logLevel.WARN:
			return "WARN";
		case logLevel.INFO:
			return "INFO";
		case logLevel.DEBUG:
			return "DEBUG";
		default:
			return "NOTHING";
	}
}

export type KafkaLogSink = {
	error(line: string): void;
	warn(line: string): void;
	info(line: string): void;
	debug(line: string): void;
};

function consoleSink(): KafkaLogSink {
	return {
		error: writeError,
		warn: writeWarn,
		info: writeInfo,
		debug: writeDebug,
	};
}

function writeError(line: string): void {
	console.error(line);
}

function writeWarn(line: string): void {
	console.warn(line);
}

function writeInfo(line: string): void {
	console.info(line);
}

function writeDebug(line: string): void {
	console.log(line);
}

/**
 * kafkajs's default logger with routine refusals lowered. kafkajs drops entries
 * above the configured level before they get here, so a lowered entry is held
 * to the same bar: at the default INFO, a coordinator refusal is not written at
 * all, and at DEBUG it is written as DEBUG.
 */
export function createKafkaLogCreator({
	sink = consoleSink(),
}: {
	sink?: KafkaLogSink;
} = {}): logCreator {
	function createLogger(configuredLevel: logLevel) {
		function writeEntry(entry: LogEntry): void {
			const level = effectiveKafkaLogLevel({ entry });
			if (level > configuredLevel) return;
			const line = formatKafkaLogLine({ entry, level });
			switch (level) {
				case logLevel.ERROR:
					sink.error(line);
					return;
				case logLevel.WARN:
					sink.warn(line);
					return;
				case logLevel.INFO:
					sink.info(line);
					return;
				case logLevel.DEBUG:
					sink.debug(line);
					return;
				default:
					return;
			}
		}
		return writeEntry;
	}
	return createLogger;
}
