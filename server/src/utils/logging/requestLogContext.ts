import type {
	InternalLogRequestContext,
	LogRequestContext,
} from "./loggerTypes.js";

export const buildRequestLogContexts = ({
	requestContext,
}: {
	requestContext: LogRequestContext;
}): {
	internal: InternalLogRequestContext;
	terminal: LogRequestContext;
} => {
	const { body: _body, ...internal } = requestContext;

	return {
		internal,
		terminal: requestContext,
	};
};
