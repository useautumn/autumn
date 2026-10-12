import { TestFeature } from "@tests/setup/v2Features.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { TestAtom } from "./ensureAtomDeployment.js";
import { expectAtomCheckCorrect } from "./expectAtomCheckCorrect.js";

/** The Atom answers itself that exactly `remaining` messages are left: a check for that many passes and one more fails. */
export const expectAtomBalance = async ({
	atom,
	customerId,
	remaining,
	timeoutMs,
}: {
	atom: TestAtom;
	customerId: string;
	remaining: number;
	timeoutMs?: number;
}): Promise<void> => {
	const messages = {
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		featureId: TestFeature.Messages,
		timeoutMs,
	};
	await expectAtomCheckCorrect({
		...messages,
		requiredBalance: remaining,
		allowed: true,
	});
	await expectAtomCheckCorrect({
		...messages,
		requiredBalance: remaining + 1,
		allowed: false,
	});
};
