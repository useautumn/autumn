import { expect, test } from "bun:test";
import { DEFAULT_SLACK_BOT_SCOPES } from "@autumn/shared/utils/auth/slackScopes";
import { getMissingSlackScopes } from "@/internal/chat/chatUtils.js";

test("an install without users:read.email is prompted to reconnect", () => {
	const scopes = DEFAULT_SLACK_BOT_SCOPES.filter(
		(s) => s !== "users:read.email",
	);
	expect(getMissingSlackScopes([...scopes])).toEqual(["users:read.email"]);
});
