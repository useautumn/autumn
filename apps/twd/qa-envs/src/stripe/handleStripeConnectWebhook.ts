import { qaEnvStub, routerStub } from "../qaEnv/stubs";
import type { Env } from "../types";
import { isValidStripeSignature } from "./isValidStripeSignature";

/** One Stripe Connect endpoint for every env: verify, then queue on the envs that own the event's account. */
export async function handleStripeConnectWebhook({
	req,
	env,
	url,
}: {
	req: Request;
	env: Env;
	url: URL;
}) {
	if (
		req.method !== "POST" ||
		url.pathname !== "/stripe/connect/sandbox" ||
		!env.STRIPE_CONNECT_WEBHOOK_SECRET
	)
		return new Response("Not found", { status: 404 });
	const body = await req.text();
	const signature = req.headers.get("stripe-signature");
	if (
		!(await isValidStripeSignature({
			body,
			header: signature,
			secret: env.STRIPE_CONNECT_WEBHOOK_SECRET,
		}))
	)
		return new Response("Bad signature", { status: 400 });
	const event = JSON.parse(body) as { account?: string };
	if (!event.account) return Response.json({ routed: 0 });
	const names = await routerStub({ env }).envsFor(event.account);
	const headers = {
		"content-type": "application/json",
		"stripe-signature": signature ?? "",
	};
	await Promise.all(
		names.map((name) =>
			qaEnvStub({ env, name }).enqueueWebhook({ body, headers }),
		),
	);
	return Response.json({ routed: names.length });
}
