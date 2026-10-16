import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { expectAutumnLockState } from "../autumnLockState.js";
import type { TestAtom } from "../ensureAtomDeployment.js";
import { expectPostgresBalancesEqual } from "../postgresEntityBalances.js";
import { type EntityPair, initEntityPair } from "./initEntityPair.js";
import {
	expectAtomViewConverged,
	finalizePair,
	type PairFinalize,
} from "./pairReplies.js";

export const LOCKED = 30;

/** A pair on 100 messages the entities share and 50 each holds alone, as the API's per-entity lock tests set up. */
export const initPerEntityLockPair = ({
	pairId,
	atom,
}: {
	pairId: string;
	atom: () => Promise<TestAtom> | TestAtom;
}) =>
	initEntityPair({
		pairId,
		atom,
		makeProducts: () => [
			products.base({
				id: "free",
				items: [
					items.monthlyMessages({ includedUsage: 100 }),
					items.monthlyMessages({
						includedUsage: 50,
						entityFeatureId: TestFeature.Users,
					}),
				],
			}),
		],
		attaches: [{ productId: "free" }],
	});

/**
 * Both locks held in Postgres and in the Atom's view, then each finalized on its own path: the lock's entity settles as
 * the API's does, with the finalize's seq landed and no lock left.
 */
export const settleEntityLockPair = async ({
	pair,
	finalize,
	atomSeqs = [2],
}: {
	pair: EntityPair;
	finalize: Omit<PairFinalize, "lockName">;
	atomSeqs?: number[];
}) => {
	await expectPostgresBalancesEqual({
		apiCustomerId: pair.apiCustomerId,
		atomCustomerId: pair.atomCustomerId,
		openLocks: [`${pair.apiCustomerId}-lock`],
	});
	await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });

	await finalizePair({ pair, lockName: "lock", ...finalize });

	await expectAutumnLockState({
		customerId: pair.atomCustomerId,
		openLockIds: [],
		atomSeqs,
	});
	await expectPostgresBalancesEqual({
		apiCustomerId: pair.apiCustomerId,
		atomCustomerId: pair.atomCustomerId,
	});
	await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
};
