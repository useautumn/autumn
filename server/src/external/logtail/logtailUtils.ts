import "dotenv/config";

import type pino from "pino";
import { initLogger } from "@/utils/logging/initLogger";

const pinoLogger = initLogger();

const createLogMethod = (pinoMethod: any, logtailMethod?: any) => {
	function rewriteAppPath(str: string) {
		if (typeof str !== "string") return str;
		// Replace file:///app/ with ./
		str = str.replace("file:///app/", "./");
		return str.replace(/\/app\//g, "./");
	}

	function rewriteErrorStack(error: Error) {
		if (error instanceof Error && typeof error.stack === "string") {
			const newError = new Error(error.message);
			newError.stack = rewriteAppPath(error.stack);
			return newError;
		}

		return error;
	}

	return (...args: any[]) => {
		let message = "";
		let mergedObj = {};

		// Helper function to convert Error objects to plain objects

		const strings = args
			.filter((arg) => typeof arg === "string")
			.map(rewriteAppPath);

		const objects = args
			.filter((arg) => typeof arg !== "string" && arg !== null)
			.map((obj) => (obj instanceof Error ? rewriteErrorStack(obj) : obj));

		// Use last string as message, or use Error message if no strings provided
		if (strings.length > 0) {
			message = strings[strings.length - 1];
		} else {
			// If no string message but we have an Error object, use its stack trace
			const errorObject = args.find((arg) => arg instanceof Error);
			if (errorObject) {
				message = rewriteAppPath(
					errorObject.stack || errorObject.message || "Error occurred",
				);
			}
		}

		// Merge all objects
		mergedObj = Object.assign({}, ...objects);

		// Pino format: object first, message second (if object exists)
		if (Object.keys(mergedObj).length > 0) {
			pinoMethod(mergedObj, message);
		} else {
			pinoMethod(message);
		}

		if (!logtailMethod) {
			return;
		}

		// Logtail format: message first, then object (if exists)
		if (Object.keys(mergedObj).length > 0) {
			logtailMethod(message, mergedObj);
		} else {
			logtailMethod(message);
		}
	};
};

const createLoggerStructure = (basePinoLogger: pino.Logger): Logger => ({
	debug: createLogMethod(basePinoLogger.debug.bind(basePinoLogger)),
	info: createLogMethod(basePinoLogger.info.bind(basePinoLogger)),
	warn: createLogMethod(basePinoLogger.warn.bind(basePinoLogger)),
	error: createLogMethod(basePinoLogger.error.bind(basePinoLogger)),
	child: ({
		context,
		onlyProd = false,
	}: {
		context: any;
		onlyProd?: boolean;
	}) => {
		if (onlyProd && process.env.NODE_ENV !== "production") {
			return createLoggerStructure(basePinoLogger);
		}

		const childPinoLogger = basePinoLogger.child(context);
		return createLoggerStructure(childPinoLogger);
	},
});

export const createLogger = () => createLoggerStructure(pinoLogger);

/**
 * Lazy dual-output logger (stdout JSON + axiom). Used only by long-running
 * trigger.dev tasks so their lines surface in both the trigger run UI and
 * our axiom store. Default `logger` / `createLogger` are unaffected.
 */
let dualPinoLogger: pino.Logger | null = null;
export const createDualLogger = () => {
	if (!dualPinoLogger) dualPinoLogger = initLogger({ mode: "dual" });
	return createLoggerStructure(dualPinoLogger);
};

export const logger = createLogger();
export type Logger = {
	debug: (...args: any[]) => void;
	info: (...args: any[]) => void;
	warn: (...args: any[]) => void;
	error: (...args: any[]) => void;
	child: (args: { context: any; onlyProd?: boolean }) => Logger;
};
