import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let quietMode = false;
let logFilePath: string | undefined;
let warnedFileFailure = false;

let logSubscriber: ((line: string) => void) | undefined;
let lineBuffer = "";

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (text: string): string =>
	text.replace(ANSI_PATTERN, "");

const feedSubscriber = (text: string): void => {
	if (!logSubscriber) {
		return;
	}
	lineBuffer += text;
	let newlineIndex = lineBuffer.indexOf("\n");
	while (newlineIndex >= 0) {
		logSubscriber(stripAnsi(lineBuffer.slice(0, newlineIndex)));
		lineBuffer = lineBuffer.slice(newlineIndex + 1);
		newlineIndex = lineBuffer.indexOf("\n");
	}
};

export const setLogSubscriber = (
	subscriber: ((line: string) => void) | undefined,
): void => {
	logSubscriber = subscriber;
	if (!subscriber) {
		lineBuffer = "";
	}
};

export const setLogFile = (path: string): void => {
	logFilePath = path;
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch {}
};

export const enableQuietMode = (): void => {
	quietMode = true;
};

export const disableQuietMode = (): void => {
	quietMode = false;
};

export const getLogFile = (): string | undefined => logFilePath;

const appendToLogFile = (text: string): void => {
	if (!logFilePath) {
		return;
	}
	try {
		appendFileSync(logFilePath, text);
	} catch (error) {
		if (!warnedFileFailure) {
			warnedFileFailure = true;
			process.stdout.write(
				`[tw] log sink: failed to write run log file (${(error as Error).message})\n`,
			);
		}
	}
};

export const sink = (text: string): void => {
	feedSubscriber(text);
	appendToLogFile(text);
	if (quietMode || logSubscriber) {
		return;
	}
	process.stdout.write(text);
};

export const sinkLine = (line: string): void => {
	sink(`${line}\n`);
};

export const narrate = (line: string): void => {
	const text = `${line}\n`;
	feedSubscriber(text);
	appendToLogFile(text);
	if (logSubscriber) {
		return;
	}
	process.stdout.write(text);
};
