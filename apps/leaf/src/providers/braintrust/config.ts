export const braintrustConfig = {
	enabled:
		process.env.LEAF_BRAINTRUST_ENABLED === "true" ||
		(process.env.NODE_ENV !== "production" &&
			process.env.LEAF_BRAINTRUST_ENABLED !== "false"),
	projectName: process.env.LEAF_BRAINTRUST_PROJECT ?? "leaf",
	serviceName: process.env.LEAF_BRAINTRUST_SERVICE ?? "leaf",
};
