import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared/utils/auth/autumnOAuthScopes";
import { ensureWebChatAuth } from "../src/internal/installations/actions/ensureWebChatAuth.js";

const orgId = process.env.LEAF_EVAL_ORG_ID;
const userId = process.env.LEAF_EVAL_USER_ID;
if (!(orgId && userId)) {
	throw new Error("LEAF_EVAL_ORG_ID and LEAF_EVAL_USER_ID are required");
}

const installation = await ensureWebChatAuth({
	orgId,
	userId,
	userScopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
});
console.log(`[seed-web-eval] installation ${installation.id} for ${orgId}`);
process.exit(0);
