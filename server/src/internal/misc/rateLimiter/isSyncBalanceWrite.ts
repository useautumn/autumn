import { ApiVersion } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";

const SYNC_TRACK_ROUTES = [
	"/v1/balances.track",
	"/v1/balances.track_tokens",
	"/v1/track",
	"/v1/track_tokens",
	"/v1/events",
];
const CHECK_ROUTES = ["/v1/balances.check", "/v1/check", "/v1/entitled"];

const isPostTo = ({ path, urls }: { path: string; urls: string[] }) =>
	urls.some((url) =>
		matchRoute({ url: path, method: "POST", pattern: { method: "POST", url } }),
	);

/** A 2.5+ track with `async: false`, or a check that writes a balance (lock or send_event). */
export const isSyncBalanceWrite = ({
	ctx,
	method,
	path,
}: {
	ctx?: Pick<AutumnContext, "apiVersion" | "requestBody">;
	method: string;
	path: string;
}): boolean => {
	if (method !== "POST" || !ctx?.apiVersion?.gte(ApiVersion.V2_5)) return false;
	// Runs before validation, so the raw body is read defensively.
	const body = (
		ctx.requestBody && typeof ctx.requestBody === "object"
			? ctx.requestBody
			: {}
	) as { async?: unknown; send_event?: unknown; lock?: { enabled?: unknown } };

	if (isPostTo({ path, urls: SYNC_TRACK_ROUTES })) return body.async === false;
	if (isPostTo({ path, urls: CHECK_ROUTES }))
		return body.lock?.enabled === true || body.send_event === true;
	return false;
};
