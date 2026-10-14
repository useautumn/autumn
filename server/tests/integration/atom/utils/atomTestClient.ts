import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export const atomTestClient = ({ atoms = true }: { atoms?: boolean } = {}) =>
	new AutumnInt({
		secretKey: defaultCtx.orgSecretKey,
		headers: { "x-billing-features": `atoms=${atoms}` },
	});
