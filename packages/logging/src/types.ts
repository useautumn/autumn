import type pino from "pino";

export type LoggerOutput = "console-pretty" | "console-json" | "axiom";
export type LoggerPreset = "default" | "dual" | "console-only" | "axiom-only";
export type LoggerLevel =
	| "trace"
	| "debug"
	| "info"
	| "warn"
	| "error"
	| "fatal";

export type CreateLoggerParams = {
	service: string;
	dataset?: string;
	level?: LoggerLevel;
	preset?: LoggerPreset;
	outputs?: LoggerOutput[];
	context?: Record<string, unknown>;
	mixin?: () => Record<string, unknown>;
	axiomToken?: string;
	axiomOrgId?: string;
	useConsoleLog?: boolean;
};

export type ResolvedLoggerOptions = Required<
	Pick<CreateLoggerParams, "service" | "preset">
> & {
	dataset: string;
	level: LoggerLevel;
	outputs: LoggerOutput[];
	hasAxiomToken: boolean;
};

export type LogArgs = unknown[];

export type AutumnLogger = {
	level?: string;
	debug: (...args: LogArgs) => void;
	info: (...args: LogArgs) => void;
	warn: (...args: LogArgs) => void;
	warning: (...args: LogArgs) => void;
	error: (...args: LogArgs) => void;
	child: (params: {
		context: Record<string, unknown>;
		onlyProd?: boolean;
	}) => AutumnLogger;
};

export type ConsoleLoggerLevel = "debug" | "info" | "warning" | "error";

export type ConsoleLogger = AutumnLogger & {
	level: ConsoleLoggerLevel;
};

export type PinoLogger = pino.Logger;
