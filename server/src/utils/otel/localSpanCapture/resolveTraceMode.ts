export const resolveTraceMode = ({ env }: { env: NodeJS.ProcessEnv }) => {
	if (env.AUTUMN_OTEL_LOCAL === "true") {
		if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
			throw new Error(
				"Local span capture requires NODE_ENV=development or test",
			);
		}
		if (!env.AUTUMN_OTEL_LOCAL_DIR) {
			throw new Error("Local span capture requires AUTUMN_OTEL_LOCAL_DIR");
		}
		return "local";
	}
	return env.AXIOM_TOKEN ? "axiom" : "disabled";
};
