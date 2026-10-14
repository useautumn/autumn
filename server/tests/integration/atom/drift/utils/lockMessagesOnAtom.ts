import { expect } from "bun:test";
import type { CheckLockParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { TestAtom } from "../../utils/ensureAtomDeployment.js";
import { checkOnAtom } from "../../utils/expectAtomCheckCorrect.js";

/** A lock of `value` messages the Atom takes itself and allows. */
export const lockMessagesOnAtom = async ({
	atom,
	customerId,
	value,
	lock,
}: {
	atom: TestAtom;
	customerId: string;
	value: number;
	lock: CheckLockParams;
}) => {
	const locked = await checkOnAtom({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: value,
		lock,
	});
	expect(locked).toMatchObject({ forwarded: null, body: { allowed: true } });
	return locked;
};
