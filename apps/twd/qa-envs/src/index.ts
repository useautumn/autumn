import { handleAdmin } from "./admin/handleAdmin";
import { qaEnvStub, TINYBIRD_HOST_SUFFIX, tinybirdStub } from "./qaEnv/stubs";
import { handleStripeConnectWebhook } from "./stripe/handleStripeConnectWebhook";
import type { Env } from "./types";

export { QaEnv } from "./qaEnv/QaEnv";
export { QaRouter } from "./router/QaRouter";
export { QaTinybird } from "./tinybird/QaTinybird";

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
		if (name.endsWith(TINYBIRD_HOST_SUFFIX))
			return tinybirdStub({
				env,
				name: name.slice(0, -TINYBIRD_HOST_SUFFIX.length),
			}).fetch(req);
		const headers = new Headers(req.headers);
		headers.delete("x-qa-internal");
		return qaEnvStub({ env, name }).fetch(new Request(req, { headers }));
	},
} satisfies ExportedHandler<Env>;
