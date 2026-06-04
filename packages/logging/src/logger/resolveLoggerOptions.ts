import type {
	CreateLoggerParams,
	LoggerLevel,
	LoggerOutput,
	ResolvedLoggerOptions,
} from "../types.js";

const parseOutputs = (
	value: string | undefined,
): LoggerOutput[] | undefined => {
	if (!value) return undefined;
	const outputs = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	if (
		outputs.every(
			(output): output is LoggerOutput =>
				output === "console-pretty" ||
				output === "console-json" ||
				output === "axiom",
		)
	) {
		return outputs;
	}

	return undefined;
};

export const resolveLoggerOptions = ({
	options,
	env = process.env,
}: {
	options: CreateLoggerParams;
	env?: NodeJS.ProcessEnv;
}): ResolvedLoggerOptions => {
	const preset = options.preset ?? "default";
	const isDevOrTest = env.NODE_ENV === "development" || env.NODE_ENV === "test";
	const hasAxiomToken = Boolean(options.axiomToken ?? env.AXIOM_TOKEN);

	let outputs = options.outputs ?? parseOutputs(env.LOG_OUTPUTS);
	if (!outputs) {
		if (preset === "console-only") outputs = ["console-pretty"];
		else if (preset === "axiom-only") outputs = ["axiom"];
		else if (preset === "dual")
			outputs = [isDevOrTest ? "console-pretty" : "console-json", "axiom"];
		else if (isDevOrTest) outputs = ["console-pretty", "axiom"];
		else outputs = ["axiom"];
	}

	const filteredOutputs = outputs.filter(
		(output) => output !== "axiom" || hasAxiomToken,
	);

	return {
		service: options.service,
		dataset: options.dataset ?? options.service,
		preset,
		level:
			options.level ??
			((env.LOG_LEVEL as LoggerLevel | undefined) ||
				(isDevOrTest || preset === "dual" ? "debug" : "info")),
		outputs: filteredOutputs.length > 0 ? filteredOutputs : ["console-pretty"],
		hasAxiomToken,
	};
};
