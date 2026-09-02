import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

const leafInternalAuth = (): AuthFn<Request> => async (request) => {
	// Must mirror env.ts's EVE_INTERNAL_AUTH_TOKEN fallback chain exactly, or
	// leaf and eve derive different tokens and every request 401s.
	const expectedToken =
		process.env.EVE_INTERNAL_AUTH_TOKEN ??
		process.env.CHAT_STATE_SECRET ??
		process.env.SLACK_STATE_SECRET ??
		process.env.BETTER_AUTH_SECRET ??
		process.env.ENCRYPTION_PASSWORD;
	const authorization = request.headers.get("authorization");
	if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
		return null;
	}
	const providerUserId =
		request.headers.get("x-leaf-provider-user-id") ??
		request.headers.get("x-leaf-user-id");
	const orgId = request.headers.get("x-leaf-org-id");
	if (!(providerUserId && orgId)) return null;
	const attributes: Record<string, string> = {
		appEnv: request.headers.get("x-leaf-app-env") ?? "sandbox",
		channelId: request.headers.get("x-leaf-channel-id") ?? "",
		orgId,
		provider: request.headers.get("x-leaf-provider") ?? "web",
		providerUserId,
		threadId: request.headers.get("x-leaf-thread-id") ?? "",
		workspaceId: request.headers.get("x-leaf-workspace-id") ?? orgId,
	};
	const chatInstallationId = request.headers.get("x-leaf-chat-installation-id");
	if (chatInstallationId) attributes.chatInstallationId = chatInstallationId;
	const autumnUserId = request.headers.get("x-leaf-autumn-user-id");
	if (autumnUserId) attributes.autumnUserId = autumnUserId;
	const orgInstructions = request.headers.get("x-leaf-org-instructions");
	if (orgInstructions) {
		attributes.orgInstructions = Buffer.from(
			orgInstructions,
			"base64url",
		).toString("utf8");
	}

	return {
		attributes,
		authenticator: "leaf-internal",
		principalId: providerUserId,
		principalType: "user",
	};
};

/** Evals and local tooling reach eve without leaf's headers; outside
 * production an env-configured org/user stands in so connections authorize. */
const localEvalAuth = (): AuthFn<Request> => async () => {
	if (process.env.NODE_ENV === "production") return null;
	const orgId = process.env.LEAF_EVAL_ORG_ID;
	const providerUserId = process.env.LEAF_EVAL_USER_ID;
	if (!(orgId && providerUserId)) return null;
	return {
		attributes: {
			appEnv: process.env.LEAF_EVAL_APP_ENV ?? "sandbox",
			channelId: "eval",
			orgId,
			provider: process.env.LEAF_EVAL_PROVIDER ?? "web",
			providerUserId,
			threadId: "eval",
			workspaceId: process.env.LEAF_EVAL_WORKSPACE_ID ?? orgId,
		},
		authenticator: "leaf-eval",
		principalId: providerUserId,
		principalType: "user",
	};
};

export default eveChannel({
	auth: [leafInternalAuth(), vercelOidc(), localEvalAuth(), localDev()],
});
