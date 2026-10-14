import type { WebhookAppKind } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ensureSvixAppId } from "../ensureSvixAppId.js";
import { ensureVercelSvixAppId } from "./ensureVercelSvixAppId.js";
import { vercelSvixAppId } from "./vercelSvixAppId.js";

export type WebhookApp = { kind: WebhookAppKind; appId: string };

export const listWebhookApps = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<WebhookApp[]> => {
	const main = await ensureSvixAppId({ ctx });
	const vercel = vercelSvixAppId({ org: ctx.org, env: ctx.env });
	return [
		{ kind: "main", appId: main },
		...(vercel ? [{ kind: "vercel" as const, appId: vercel }] : []),
	];
};

export const ensureWebhookAppId = ({
	ctx,
	kind,
}: {
	ctx: AutumnContext;
	kind: WebhookAppKind;
}): Promise<string> =>
	kind === "vercel" ? ensureVercelSvixAppId({ ctx }) : ensureSvixAppId({ ctx });
