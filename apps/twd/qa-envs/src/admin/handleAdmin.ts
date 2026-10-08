import { isHostnameFree } from "../cloudflare/envHostname";
import { qaEnvStub, routerStub } from "../qaEnv/stubs";
import type { CreateEnvInput, Env } from "../types";

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;
const RESERVED = new Set(["hooks", "www", "api", "app", "twd", "admin"]);

const json = (data: unknown, status = 200) => Response.json(data, { status });

/** twd's control API: `/__admin/<name>/<action>`, bearer QA_ADMIN_TOKEN. */
export async function handleAdmin({
	req,
	env,
	url,
}: {
	req: Request;
	env: Env;
	url: URL;
}): Promise<Response> {
	if (req.headers.get("authorization") !== `Bearer ${env.QA_ADMIN_TOKEN}`)
		return json({ error: "unauthorized" }, 401);
	const [, , name, action] = url.pathname.split("/");
	if (name === "_routes" && req.method === "GET")
		return json(await routerStub({ env }).all());
	if (!name || !NAME_RE.test(name) || RESERVED.has(name))
		return json({ error: "invalid env name" }, 400);
	const stub = qaEnvStub({ env, name });
	const publicUrl = `https://${name}.${env.QA_DOMAIN}`;

	switch (`${req.method} ${action ?? ""}`) {
		case "GET status":
			return json(await stub.status());
		case "POST begin": {
			if (!(await isHostnameFree({ env, name })))
				return json(
					{ error: `${name}.${env.QA_DOMAIN} is used by something else` },
					409,
				);
			const input = (await req.json()) as CreateEnvInput;
			if (!input.sha || !input.runtimeEnv?.DATABASE_URL)
				return json(
					{ error: "sha and runtimeEnv.DATABASE_URL are required" },
					400,
				);
			return json(await stub.begin({ name, publicUrl, input }));
		}
		case "POST source": {
			const buildId = url.searchParams.get("build");
			if (!buildId || !req.body)
				return json({ error: "build and body are required" }, 400);
			const builder = qaEnvStub({ env, name: `build:${name}:${buildId}` });
			return builder.fetch(
				new Request(req.url, {
					method: "POST",
					headers: { "x-qa-internal": "source" },
					body: req.body,
				}),
			);
		}
		case "POST build": {
			const buildId = url.searchParams.get("build");
			if (!buildId) return json({ error: "build is required" }, 400);
			await qaEnvStub({ env, name: `build:${name}:${buildId}` }).runBuild();
			return json({ ok: true });
		}
		case "POST sleep":
			await stub.sleepNow();
			return json({ ok: true });
		case "DELETE ":
			await stub.destroyEnv();
			return json({ ok: true });
		default:
			return json({ error: "unknown action" }, 404);
	}
}
