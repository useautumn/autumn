import type {
	CreateLoggerParams,
	LoggerLevel,
	LoggerOutput,
	LoggerPreset,
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

// A FireLens sidecar tails the task's stdout, so shipping to Axiom in-process
// would double-deliver every line.
const shipsThroughFireLensSidecar = ({
	env,
	isDevOrTest,
	preset,
}: {
	env: NodeJS.ProcessEnv;
	isDevOrTest: boolean;
	preset: LoggerPreset;
}) =>
	preset === "firelens" &&
	!isDevOrTest &&
	Boolean(env.ECS_CONTAINER_METADATA_URI_V4);

export const resolveDeployment = (env: NodeJS.ProcessEnv = process.env) => {
	if (env.NODE_ENV === "development") return "dev";
	if (env.NODE_ENV === "test") return "test";
	return "prod";
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
		else if (shipsThroughFireLensSidecar({ env, isDevOrTest, preset }))
			outputs = ["console-json"];
		else if (isDevOrTest) outputs = ["console-pretty"];
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
