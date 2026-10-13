import {
	AffectedResource,
	ApiVersionClass,
	applyRequestVersionChanges,
	LATEST_VERSION,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	isQueuedTokenTrack,
	isQueuedTrack,
} from "@/internal/balances/track/utils/isQueuedTrack";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";

type RequestBody = {
	async?: boolean;
	send_event?: unknown;
	lock?: { enabled?: unknown };
};

const TRACK_ROUTES = ["/v1/balances.track", "/v1/track", "/v1/events"];
const TRACK_TOKENS_ROUTES = ["/v1/balances.track_tokens", "/v1/track_tokens"];
const CHECK_ROUTES = ["/v1/balances.check", "/v1/check", "/v1/entitled"];

const isPostTo = ({ path, urls }: { path: string; urls: string[] }) =>
	urls.some((url) =>
		matchRoute({ url: path, method: "POST", pattern: { method: "POST", url } }),
	);

/** The raw body as the handler will see it, so `async` gets its version's default. */
const toLatestBody = ({
	ctx,
	body,
	resource,
}: {
	ctx: AutumnContext;
	body: RequestBody;
	resource: AffectedResource;
}): RequestBody =>
	applyRequestVersionChanges({
		input: body,
		fromVersion: ctx.apiVersion,
		toVersion: new ApiVersionClass(LATEST_VERSION),
		resource,
		ctx,
	});

/** A track the handler will apply synchronously, or a check that writes a balance (lock or send_event). */
export const isSyncBalanceWrite = ({
	ctx,
	method,
	path,
}: {
	ctx?: AutumnContext;
	method: string;
	path: string;
}): boolean => {
	if (method !== "POST" || !ctx?.apiVersion) return false;
	// Runs before validation, so the raw body is read defensively.
	const body = ctx.requestBody;
	if (!body || typeof body !== "object" || Array.isArray(body)) return false;
	const rawBody = body as RequestBody;

	if (isPostTo({ path, urls: TRACK_ROUTES })) {
		const latest = toLatestBody({
			ctx,
			body: rawBody,
			resource: AffectedResource.Track,
		});
		return !isQueuedTrack({ ctx, body: latest });
	}
	if (isPostTo({ path, urls: TRACK_TOKENS_ROUTES })) {
		const latest = toLatestBody({
			ctx,
			body: rawBody,
			resource: AffectedResource.TrackTokens,
		});
		return !isQueuedTokenTrack({ body: latest });
	}
	if (isPostTo({ path, urls: CHECK_ROUTES })) {
		return rawBody.lock?.enabled === true || rawBody.send_event === true;
	}
	return false;
};
