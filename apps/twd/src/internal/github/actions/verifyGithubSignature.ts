import { createHmac, timingSafeEqual } from "node:crypto";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

/** Checks `X-Hub-Signature-256` against GITHUB_WEBHOOK_SECRET in constant time. */
export const verifyGithubSignature = ({
	ctx,
	body,
	signature,
}: {
	ctx: TwdContext;
	body: string;
	signature: string | undefined;
}) => {
	const secret = ctx.env.GITHUB_WEBHOOK_SECRET;
	if (!secret)
		throw new TwdError({
			status: 503,
			code: "github_webhook_not_configured",
			message: "GITHUB_WEBHOOK_SECRET is not set on this twd.",
			next: "Nothing to do from the caller side; GitHub will retry.",
			escalate:
				"a twd admin must set GITHUB_WEBHOOK_SECRET to the repo webhook secret.",
		});
	const expected = Buffer.from(
		`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
	);
	const given = Buffer.from(signature ?? "");
	if (given.length === expected.length && timingSafeEqual(given, expected))
		return;
	throw new TwdError({
		status: 401,
		code: "invalid_signature",
		message: "X-Hub-Signature-256 does not match the payload.",
		next: "Check the webhook secret configured on GitHub matches GITHUB_WEBHOOK_SECRET.",
		escalate: "a twd admin must align the GitHub webhook secret.",
	});
};
