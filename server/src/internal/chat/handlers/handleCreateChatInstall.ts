import {
	AppEnv,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	ErrCode,
	isOAuthResourceScope,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import {
	CHAT_AUTH_MODES,
	ChatAuthMode,
} from "@autumn/shared/models/chatModels/chatEnums";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const installBody = z.strictObject({
	provider: z.literal(slackProvider),
	env: z.enum(AppEnv).optional(),
	mode: z.enum(CHAT_AUTH_MODES).optional(),
	scopes: z.array(z.string()).optional(),
});

const resolveAgentScopes = ({
	mode,
	scopes,
}: {
	mode: ChatAuthMode;
	scopes?: string[];
}) => {
	if (mode !== ChatAuthMode.Restricted) {
		return [...DEFAULT_OAUTH_RESOURCE_SCOPES];
	}
	const bounded = (scopes ?? []).filter(isOAuthResourceScope);
	if (bounded.length === 0) {
		throw new RecaseError({
			message:
				"Restricted mode needs at least one valid scope. Pick scopes or choose another permission mode.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return bounded;
};

export const handleCreateChatInstall = createRoute({
	scopes: [Scopes.Organisation.Write, Scopes.ApiKeys.Write],
	body: installBody,
	handler: async (c) => {
		const { env, mode = ChatAuthMode.PerUser, scopes } = c.req.valid("json");
		const url = ChatService.createInstallUrl(c.get("ctx"), {
			env,
			mode,
			scopes: resolveAgentScopes({ mode, scopes }),
		});

		return c.json({ url });
	},
});
