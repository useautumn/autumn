import { ApiVersion, type ApprovalRuleParams } from "@autumn/shared";
import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** A client whose billing previews also return `_permission_facts`, plus `_permission` for inline rules. */
export const permissionFactsClient = ({
	rules = [],
	principal,
	sandboxAsLive = false,
	version = ApiVersion.V2_1,
}: {
	rules?: ApprovalRuleParams[];
	principal?: ApprovalPrincipal;
	/** Evaluates as if the test org's sandbox were live, since sandbox is exempt. */
	sandboxAsLive?: boolean;
	version?: ApiVersion;
} = {}) =>
	new AutumnInt({
		version,
		secretKey: ctx.orgSecretKey,
		headers: {
			"x-include-permission-facts": JSON.stringify({ rules, principal }),
			...(sandboxAsLive ? { "x-approvals-sandbox-as-live": "true" } : {}),
		},
	});
