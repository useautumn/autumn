import type { AutumnLogger } from "../types.js";
import type {
	LogAppContext,
	LogRequestContext,
	LogTriggerContext,
} from "./types.js";

export const addRequestToLogs = ({
	logger,
	requestContext,
}: {
	logger: AutumnLogger;
	requestContext: LogRequestContext;
}): AutumnLogger => logger.child({ context: { req: requestContext } });

export const addAppContextToLogs = ({
	logger,
	appContext,
}: {
	logger: AutumnLogger;
	appContext: LogAppContext;
}): AutumnLogger => logger.child({ context: { context: appContext } });

export const addTriggerToLogs = ({
	logger,
	triggerContext,
}: {
	logger: AutumnLogger;
	triggerContext: LogTriggerContext;
}): AutumnLogger => logger.child({ context: { trigger: triggerContext } });

export const addExtrasToLogs = ({
	logger,
	extras,
}: {
	logger: AutumnLogger;
	extras: Record<string, unknown>;
}): AutumnLogger => logger.child({ context: { extras } });
