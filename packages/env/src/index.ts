import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const parseHttpUrl = (
	value: string,
	ctx: z.RefinementCtx,
): URL | typeof z.NEVER => {
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
		return z.NEVER;
	}
	if (url.username || url.password || value.includes("?") || value.includes("#")) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "must not include credentials, query, or hash",
		});
		return z.NEVER;
	}
	return url;
};

const originSchema = z.string().transform((value, ctx) => {
	const url = parseHttpUrl(value, ctx);
	if (url === z.NEVER) return z.NEVER;
	if (url.pathname !== "/") {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "must be an origin without credentials, path, query, or hash",
		});
		return z.NEVER;
	}
	return url.origin;
});

/** Origin, or origin + path prefix (`https://host/backend`). Trailing slash dropped. */
const publicBaseSchema = z.string().transform((value, ctx) => {
	const url = parseHttpUrl(value, ctx);
	if (url === z.NEVER) return z.NEVER;
	const path = url.pathname.replace(/\/$/, "");
	return path ? `${url.origin}${path}` : url.origin;
});

export const createAutumnEnv = (
	runtimeEnv: Record<string, string | undefined>,
) =>
	createEnv({
		server: {
			AUTUMN_API_URL: originSchema,
			AUTUMN_PUBLIC_API_URL: publicBaseSchema,
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
