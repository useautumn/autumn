import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { TestAtom } from "../../utils/ensureAtomDeployment.js";
import { expectAtomCheckCorrect } from "../../utils/expectAtomCheckCorrect.js";

/** The Atom answers this check itself, with exactly the reply the API gives to the same check. */
export const expectAtomAgrees = async ({
	atom,
	api,
	customerId,
	entityId,
	featureId,
	requiredBalance,
}: {
	atom: TestAtom;
	api: AutumnInt;
	customerId: string;
	entityId?: string;
	featureId: string;
	requiredBalance: number;
}) => {
	const apiAnswer: { allowed: boolean } = await api.post("/balances.check", {
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		required_balance: requiredBalance,
	});
	await expectAtomCheckCorrect({
		atom,
		api,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		entityId,
		featureId,
		requiredBalance,
		allowed: apiAnswer.allowed,
		timeoutMs: 15_000,
	});
};
