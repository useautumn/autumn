import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const originSchema = z.string().transform((value, ctx) => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "must be a valid URL",
		});
		return z.NEVER;
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "must use http or https",
		});
	}
	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		value.includes("?") ||
		value.includes("#")
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "must be an origin without credentials, path, query, or hash",
		});
	}

	return url.origin;
});

export const createAutumnEnv = (
	runtimeEnv: Record<string, string | undefined>,
) =>
	createEnv({
		server: {
			AUTUMN_API_URL: originSchema,
			AUTUMN_PUBLIC_API_URL: originSchema,
		},
		runtimeEnv: {
			AUTUMN_API_URL: runtimeEnv.AUTUMN_API_URL,
			AUTUMN_PUBLIC_API_URL:
				runtimeEnv.AUTUMN_PUBLIC_API_URL || runtimeEnv.AUTUMN_API_URL,
		},
		emptyStringAsUndefined: true,
		onValidationError: (issues) => {
			throw new Error(
				`Invalid Autumn environment: ${issues
					.map(
						(issue) =>
							`${issue.path?.join(".") ?? "environment"}: ${issue.message}`,
					)
					.join("; ")}`,
			);
		},
	});

export type AutumnEnv = ReturnType<typeof createAutumnEnv>;

let autumnEnv: AutumnEnv | undefined;

export const getAutumnEnv = (): AutumnEnv => {
	autumnEnv ??= createAutumnEnv(process.env);
	return autumnEnv;
};
