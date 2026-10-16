import type { KafkaLogLevel, KafkaLogSink } from "../types/kafkaClient.js";

/** The logger Confluent's KafkaJS shim writes its own lines (and librdkafka's, for its clients) through. */
export type ShimLogger = {
	info(message: string, extra?: object): void;
	error(message: string, extra?: object): void;
	warn(message: string, extra?: object): void;
	debug(message: string, extra?: object): void;
	namespace(): ShimLogger;
	setLogLevel(): void;
};

export type KafkaLog = {
	shim: ShimLogger;
	write(level: KafkaLogLevel, message: string, fields?: object): void;
	/** librdkafka's `event.log`: a syslog severity, a facility and a line. */
	writeNative(entry: { severity: number; fac: string; message: string }): void;
};

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

function consoleSink(): KafkaLogSink {
	return {
		error: writeError,
		warn: writeWarn,
		info: writeInfo,
		debug: writeDebug,
	};
}

function levelOfSeverity(severity: number): KafkaLogLevel {
	if (severity <= 3) return "error";
	if (severity === 4) return "warn";
	if (severity <= 6) return "info";
	return "debug";
}

/** One JSON line per entry, the shape the kafkajs lines in Axiom already had. */
export function createKafkaLog({
	clientId,
	sink = consoleSink(),
}: {
	clientId: string;
	sink?: KafkaLogSink;
}): KafkaLog {
	function write(
		level: KafkaLogLevel,
		message: string,
		fields: object = {},
	): void {
		sink[level](
			JSON.stringify({
				level: level.toUpperCase(),
				clientId,
				...fields,
				message,
			}),
		);
	}
	function writeNative({
		severity,
		fac,
		message,
	}: {
		severity: number;
		fac: string;
		message: string;
	}): void {
		write(levelOfSeverity(severity), `[librdkafka] ${message}`, {
			facility: fac,
		});
	}
	function shimInfo(message: string, extra?: object): void {
		write("info", message, extra);
	}
	function shimError(message: string, extra?: object): void {
		write("error", message, extra);
	}
	function shimWarn(message: string, extra?: object): void {
		write("warn", message, extra);
	}
	function shimDebug(): void {
		// The shim's debug lines are per message; they would drown everything else.
	}
	function namespace(): ShimLogger {
		return shim;
	}
	function setLogLevel(): void {}
	const shim: ShimLogger = {
		info: shimInfo,
		error: shimError,
		warn: shimWarn,
		debug: shimDebug,
		namespace,
		setLogLevel,
	};
	return { shim, write, writeNative };
}
