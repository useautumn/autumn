import { ATOM_TOKEN_HASH_HEADER } from "@autumn/byoc";
import { AutumnClientError } from "./autumnClientError.js";

const TIMEOUT_MS = 10_000;

const errorCodeOf = async (reply: Response): Promise<string | null> =>
	reply
		.json()
		.then((body: { code?: unknown } | null) =>
			typeof body?.code === "string" ? body.code : null,
		)
		.catch(() => null);

/** A successful reply, or AutumnClientError for any other answer; a network failure or timeout rejects as is. */
export const postToAutumn = async ({
	ctx,
	path,
	tokenHash,
	body,
}: {
	ctx: { autumnApiUrl: string };
	path: string;
	tokenHash: string;
	body: unknown;
}): Promise<Response> => {
	const reply = await fetch(`${ctx.autumnApiUrl}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[ATOM_TOKEN_HASH_HEADER]: tokenHash,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (reply.ok) return reply;
	throw new AutumnClientError({
		path,
		status: reply.status,
		code: await errorCodeOf(reply),
	});
};
