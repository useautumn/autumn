import { describe, expect, test } from "bun:test";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	SLACK_MCP_OAUTH_CLIENT_ID,
	WEB_MCP_OAUTH_CLIENT_ID,
} from "@autumn/auth/oauth";
import { HIDDEN_OAUTH_CONSENT_CLIENT_IDS } from "@/internal/auth/repos/oauthConsentRepo.js";

describe("authorized app visibility", () => {
	test("hides first-party dashboard and admin OAuth clients", () => {
		expect(HIDDEN_OAUTH_CONSENT_CLIENT_IDS).toContain(WEB_MCP_OAUTH_CLIENT_ID);
		expect(HIDDEN_OAUTH_CONSENT_CLIENT_IDS).toContain(
			AUTUMN_ADMIN_OAUTH_CLIENT_ID,
		);
		expect(HIDDEN_OAUTH_CONSENT_CLIENT_IDS).not.toContain(
			SLACK_MCP_OAUTH_CLIENT_ID,
		);
	});
});
