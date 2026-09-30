import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod/v4";
import { TwdError } from "../../../http/apiError.ts";

/** One-line human summary, then compact JSON. */
export const toolOk = ({
	summary,
	data,
}: {
	summary: string;
	data: unknown;
}): CallToolResult => ({
	content: [{ type: "text", text: `${summary}\n${JSON.stringify(data)}` }],
});

const toolError = (payload: {
	code: string;
	message: string;
	next: string;
	escalate: string | null;
}): CallToolResult => ({
	isError: true,
	content: [
		{
			type: "text",
			text: `Error ${payload.code}: ${payload.message}\n${JSON.stringify(payload)}`,
		},
	],
});

const toEscalate = (escalate: string | null) => {
	if (!escalate) return null;
	if (/^ask your human/i.test(escalate)) return escalate;
	return `Ask your human to resolve this: ${escalate}`;
};

/** Validates args, runs the tool, and turns TwdErrors (or anything else) into an isError result. */
export const runTool = async <S extends z.ZodType>({
	input,
	rawArgs,
	run,
}: {
	input: S;
	rawArgs: unknown;
	run: (args: z.infer<S>) => Promise<CallToolResult>;
}): Promise<CallToolResult> => {
	const parsed = input.safeParse(rawArgs ?? {});
	if (!parsed.success) {
		return toolError({
			code: "invalid_arguments",
			message: parsed.error.issues
				.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
				.join("; "),
			next: "Fix the arguments to match the tool's input schema and call it again.",
			escalate: null,
		});
	}
	try {
		return await run(parsed.data);
	} catch (error) {
		if (error instanceof TwdError) {
			return toolError({
				code: error.code,
				message: error.message,
				next: error.next,
				escalate: toEscalate(error.escalate),
			});
		}
		return toolError({
			code: "internal",
			message: error instanceof Error ? error.message : String(error),
			next: "Retry once; if it fails again, stop and report the message.",
			escalate: "Ask your human to check the twd server logs for this error.",
		});
	}
};
