import { handleAdmin } from "./admin/handleAdmin";
import { qaEnvStub } from "./qaEnv/stubs";
import { handleStripeConnectWebhook } from "./stripe/handleStripeConnectWebhook";
import type { Env } from "./types";

export { QaEnv } from "./qaEnv/QaEnv";
export { QaRouter } from "./router/QaRouter";

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname.startsWith("/__admin/"))
			return handleAdmin({ req, env, url });
		if (url.hostname === `hooks.${env.QA_DOMAIN}`)
			return handleStripeConnectWebhook({ req, env, url });
		if (!url.hostname.endsWith(`.${env.QA_DOMAIN}`))
			return new Response("Not found", { status: 404 });
		const name = url.hostname.slice(0, -env.QA_DOMAIN.length - 1);
		const headers = new Headers(req.headers);
		headers.delete("x-qa-internal");
		return qaEnvStub({ env, name }).fetch(new Request(req, { headers }));
	},
} satisfies ExportedHandler<Env>;
