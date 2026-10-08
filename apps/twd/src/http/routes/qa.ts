import { Hono } from "hono";
import { CreateQaEnvBody, QA_ENV_NAME } from "../../api/contract.ts";
import { createQaEnv } from "../../internal/qa/actions/createQaEnv.ts";
import { deleteQaEnv } from "../../internal/qa/actions/deleteQaEnv.ts";
import { getQaEnv, listQaEnvs } from "../../internal/qa/actions/listQaEnvs.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const requireName = (name: string) => {
	if (QA_ENV_NAME.test(name)) return name;
	throw new TwdError({
		status: 400,
		code: "invalid_qa_env_name",
		message: `"${name}" is not a valid QA env name.`,
		next: "Use lowercase letters, digits and hyphens (a DNS label, max 42 chars).",
	});
};

export const qaRoutes = new Hono<TwdHono>()
	.get("/qa", async (c) =>
		c.json({
			envs: await listQaEnvs({
				ctx: c.get("ctx"),
				includeDeleted: c.req.query("include") === "deleted",
			}),
		}),
	)
	.post("/qa", async (c) => {
		const parsed = CreateQaEnvBody.safeParse(await c.req.json());
		if (!parsed.success)
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: parsed.error.message,
				next: "Send { ref, parentBranch, secrets: { BETTER_AUTH_SECRET, ENCRYPTION_IV, ENCRYPTION_PASSWORD } }.",
			});
		return c.json(await createQaEnv({ ctx: c.get("ctx"), body: parsed.data }));
	})
	.get("/qa/:name", async (c) =>
		c.json(
			await getQaEnv({
				ctx: c.get("ctx"),
				name: requireName(c.req.param("name")),
			}),
		),
	)
	.delete("/qa/:name", async (c) =>
		c.json(
			await deleteQaEnv({
				ctx: c.get("ctx"),
				name: requireName(c.req.param("name")),
			}),
		),
	);
