import "dotenv/config";

import type pino from "pino";
import { initLogger } from "@/utils/logging/initLogger";

const pinoLogger = initLogger();

const createLogMethod = (pinoMethod: any, logtailMethod?: any) => {
	function rewriteAppPath(str: string) {
		if (typeof str !== "string") return str;
		str = str.replace("file:///app/", "./");
		return str.replace(/\/app\//g, "./");
	}

	return (...args: any[]) => {
		let message = "";
		let mergedObj = {};

		const strings = args
			.filter((arg) => typeof arg === "string")
			.map(rewriteAppPath);

		const objects = args
			.filter((arg) => typeof arg !== "string" && arg !== null)
			.map((obj) => (obj instanceof Error ? { error: obj } : obj));

		if (strings.length > 0) {
			message = strings[strings.length - 1];
		} else {
			const errorObject = args.find((arg) => arg instanceof Error);
			if (errorObject) {
				message = rewriteAppPath(
					errorObject.stack || errorObject.message || "Error occurred",
				);
			}
		}

		mergedObj = Object.assign({}, ...objects);

		if (Object.keys(mergedObj).length > 0) {
			pinoMethod(mergedObj, message);
		} else {
			pinoMethod(message);
		}

		if (!logtailMethod) {
			return;
		}

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
