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

const initCustomerOnAtom = async ({ customerId }: { customerId: string }) => {
	const plan = free();
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const { autumnV2_4 } = scenario;
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
