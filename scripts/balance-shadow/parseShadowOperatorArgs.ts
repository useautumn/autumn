import { parseArgs } from "node:util";

export function parseShadowOperatorArgs({ args }: { args: string[] }) {
	const { values } = parseArgs({
		args,
		options: {
			mode: { type: "string", default: "compare" },
			execute: { type: "boolean", default: false },
			"confirm-quiet": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
		strict: true,
		allowPositionals: false,
	});
	if (values.help) return { help: true } as const;
	if (values.mode !== "initialize" && values.mode !== "compare")
		throw new Error("Mode must be initialize or compare");
	if (values.execute && values.mode !== "initialize")
		throw new Error("Only initialize accepts --execute");
	if (!values["confirm-quiet"])
		throw new Error(
			"Pause cohort mutations and drain copies across all processes, then pass --confirm-quiet",
		);
	return { help: false, mode: values.mode, execute: values.execute } as const;
}
