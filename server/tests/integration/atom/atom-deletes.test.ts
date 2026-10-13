/**
 * A deleted customer or entity is deleted on its Atom too, end to end: API delete → balance worker evict → herald →
 * the Atom's deletion of it. Checks on it are forwarded to the API, and only a newer read brings it back.
 *
 * Contract:
 *  1. deleting a customer: the Atom stops answering for it and for each of its entities (customer_deleted), and its
 *     balance worker keeps no state for it;
 *  2. deleting an entity of a customer that stays: the Atom forwards that entity (entity_deleted) and keeps answering
 *     the customer itself; the same when the entity is deleted by its id alone;
 *  3. a customer created again under the same id: the Atom answers it itself, off its new balance, never the old one.
 *
 * Red (dev): the Atom keeps answering every one of these checks itself from the deleted subject's last copy.
 * The scenarios share the test org's one Atom, so they run in order, in this one file.
 */

import { afterAll, beforeAll, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectWorkerHoldsNoSubject } from "@tests/utils/expectWorkerHoldsNoSubject.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
	type TestAtom,
} from "./utils/ensureAtomDeployment.js";
import { expectAtomCheckCorrect } from "./utils/expectAtomCheckCorrect.js";

const autumn = atomTestClient();
const runsOnDevAtom = isBalanceWorkerRoute() && !atomIsHosted();

beforeAll(async () => {
	await deleteAtomDeployment({ autumn });
});

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

const free = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

/** A customer on 100 monthly messages with two entities of ids only it has, each on its own plan, and each check answered by the Atom itself. */
const initCustomerOnAtom = async ({ customerId }: { customerId: string }) => {
	const plan = free();
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const { autumnV2_4 } = scenario;
	// Ids unique to the customer, so an entity can be deleted by its id alone.
	const entityIds = [`${customerId}-ent-1`, `${customerId}-ent-2`];
	await autumnV2_4.entities.create(
		customerId,
		entityIds.map((id) => ({ id, name: id, feature_id: TestFeature.Users })),
	);
	for (const entityId of entityIds)
		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: plan.id,
		});
	const atom = await ensureAtomDeployment({ autumn });
	const subjects = [undefined, ...entityIds];
	// A track on each puts it on the Atom; the Atom then answers it without the API.
	for (const entityId of subjects)
		await autumnV2_4.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
	for (const entityId of subjects)
		await expectAtomAnswers({
			atom,
			customerId,
			entityId,
			requiredBalance: 90,
		});
	return { ...scenario, atom, entityIds };
};

const expectAtomAnswers = ({
	atom,
	customerId,
	entityId,
	requiredBalance,
}: {
	atom: TestAtom;
	customerId: string;
	entityId?: string;
	requiredBalance: number;
}) =>
	expectAtomCheckCorrect({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		requiredBalance,
		allowed: true,
	});

/** Polls until the Atom forwards the check to the API for `forwarded`, whatever the API answers. */
const expectAtomForwards = ({
	atom,
	customerId,
	entityId,
	forwarded,
}: {
	atom: TestAtom;
	customerId: string;
	entityId?: string;
	forwarded: string;
}) =>
	expectAtomCheckCorrect({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		requiredBalance: 1,
		forwarded,
	});

test.skipIf(!runsOnDevAtom)(
	`${chalk.yellowBright("atom-deletes1: a deleted customer is answered by the API for itself and each entity, and leaves its worker")}`,
	async () => {
		const { customerId, entityIds, atom, ctx, autumnV2_4 } =
			await initCustomerOnAtom({ customerId: "atom-deletes1" });

		await autumnV2_4.post("/customers.delete", { customer_id: customerId });

		for (const entityId of [undefined, ...entityIds])
			await expectAtomForwards({
				atom,
				customerId,
				entityId,
				forwarded: "customer_deleted",
			});
		await expectWorkerHoldsNoSubject({
			org: ctx.org,
			env: ctx.env,
			customerId,
		});
	},
	180_000,
);

test.skipIf(!runsOnDevAtom)(
	`${chalk.yellowBright("atom-deletes2: a deleted entity is answered by the API, by customer and entity id or entity id alone, while its customer stays on the Atom")}`,
	async () => {
		const { customerId, entityIds, atom, autumnV2_4 } =
			await initCustomerOnAtom({ customerId: "atom-deletes2" });
		const [byBoth, byEntityId] = entityIds;

		await autumnV2_4.post("/entities.delete", {
			customer_id: customerId,
			entity_id: byBoth,
		});
		await autumnV2_4.post("/entities.delete", { entity_id: byEntityId });

		for (const entityId of [byBoth, byEntityId])
			await expectAtomForwards({
				atom,
				customerId,
				entityId,
				forwarded: "entity_deleted",
			});
		await expectAtomAnswers({ atom, customerId, requiredBalance: 90 });
	},
	180_000,
);

test.skipIf(!runsOnDevAtom)(
	`${chalk.yellowBright("atom-deletes3: a customer created again under the same id is answered by the Atom off its new balance")}`,
	async () => {
		const customerId = "atom-deletes3";
		const { atom, autumnV2_4 } = await initCustomerOnAtom({ customerId });
		await autumnV2_4.post("/customers.delete", { customer_id: customerId });
		await expectAtomForwards({
			atom,
			customerId,
			forwarded: "customer_deleted",
		});

		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free()] })],
			actions: [s.billing.attach({ productId: "free" })],
		});
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		// The old copy had 90 left; the new customer has 70, so only a fresh read allows 70 and refuses 71.
		await expectAtomAnswers({ atom, customerId, requiredBalance: 70 });
		await expectAtomCheckCorrect({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 71,
			allowed: false,
		});
	},
	240_000,
);
