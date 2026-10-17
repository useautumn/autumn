import { ApiVersion } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** A secret-key client whose billing previews also return `_permission_facts`. */
export const permissionFactsClient = ({
	version = ApiVersion.V2_1,
}: {
	version?: ApiVersion;
} = {}) =>
	new AutumnInt({
		version,
		secretKey: ctx.orgSecretKey,
		headers: { "x-include-permission-facts": "true" },
	});
