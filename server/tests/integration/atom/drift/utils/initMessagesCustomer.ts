import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import type { TestAtom } from "../../utils/ensureAtomDeployment.js";
import { expectAtomBalance } from "../../utils/expectAtomBalance.js";

export const INCLUDED_MESSAGES = 100;

/** A customer on a free plan of 100 monthly messages, which `atom` answers for once it shows all 100. */
export const initMessagesCustomer = async ({
	customerId,
	atom,
}: {
	customerId: string;
	atom: () => Promise<TestAtom> | TestAtom;
}) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const answering = await atom();
	await expectAtomBalance({
		atom: answering,
		customerId,
		remaining: INCLUDED_MESSAGES,
	});
	return { ...scenario, atom: answering };
};
