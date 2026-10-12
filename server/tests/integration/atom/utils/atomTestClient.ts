import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** The test org's client, holding `atoms` on Autumn's own billing or not, whatever that billing says. */
export const atomTestClient = ({ atoms = true }: { atoms?: boolean } = {}) =>
	new AutumnInt({
		secretKey: defaultCtx.orgSecretKey,
		headers: { "x-atoms-access": String(atoms) },
	});
