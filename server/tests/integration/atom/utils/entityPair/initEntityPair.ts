import { TestFeature } from "@tests/setup/v2Features.js";
import type { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { TestAtom } from "../ensureAtomDeployment.js";
import { expectAtomCheckCorrect } from "../expectAtomCheckCorrect.js";

type Product = ReturnType<typeof products.base>;

/** A plan attached to the customer, or to one of its entities by index. */
export type PairAttach = { productId: string; entityIndex?: number };

/** Two customers set up alike: one driven through the API, one through the Atom; each id is its own product prefix. */
export type EntityPair = {
	atom: TestAtom;
	autumn: AutumnInt;
	apiCustomerId: string;
	atomCustomerId: string;
	entityIds: string[];
};

const ENTITY_FEATURE_ID = TestFeature.Users;

/** One customer on fresh copies of the plans, with `entityCount` entities ("ent-1", ...) and every attach run in order. */
const initPairCustomer = ({
	customerId,
	makeProducts,
	attaches,
	entityCount,
}: {
	customerId: string;
	makeProducts: () => Product[];
	attaches: PairAttach[];
	entityCount: number;
}) =>
	initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: makeProducts() }),
			...(entityCount > 0
				? [s.entities({ count: entityCount, featureId: ENTITY_FEATURE_ID })]
				: []),
		],
		actions: attaches.map(({ productId, entityIndex }) =>
			s.billing.attach({ productId, entityIndex }),
		),
	});

/**
 * `<pairId>-api` and `<pairId>-atom`, set up alike, once the Atom answers `featureId` for the atom customer and each of its
 * entities itself, as a deducting check would be answered.
 */
export const initEntityPair = async ({
	pairId,
	atom,
	makeProducts,
	attaches,
	entityCount = 2,
	featureId = TestFeature.Messages,
}: {
	pairId: string;
	atom: () => Promise<TestAtom> | TestAtom;
	makeProducts: () => Product[];
	attaches: PairAttach[];
	entityCount?: number;
	featureId?: string;
}): Promise<EntityPair> => {
	const apiCustomerId = `${pairId}-api`;
	const atomCustomerId = `${pairId}-atom`;
	const [apiScenario] = await Promise.all(
		[apiCustomerId, atomCustomerId].map((customerId) =>
			initPairCustomer({ customerId, makeProducts, attaches, entityCount }),
		),
	);
	const answering = await atom();
	const entityIds = (apiScenario?.entities ?? []).map(({ id }) => id);
	for (const entityId of [undefined, ...entityIds])
		await expectAtomCheckCorrect({
			atom: answering,
			secretKey: defaultCtx.orgSecretKey,
			customerId: atomCustomerId,
			entityId,
			featureId,
			requiredBalance: 1,
		});
	return {
		atom: answering,
		autumn: apiScenario?.autumnV2_6 as AutumnInt,
		apiCustomerId,
		atomCustomerId,
		entityIds,
	};
};
