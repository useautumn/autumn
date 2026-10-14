import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 2 });
const ANTI_ENTROPY_TIMEOUT_MS = 180_000;
const RELAY_TIMEOUT_MS = 3_000;

const everyReplica = () =>
	Array.from({ length: replicaSet().size() }, (_, index) => ({
		index,
		timeoutMs: index === 0 ? undefined : RELAY_TIMEOUT_MS,
	}));

const freeMessages = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-set1: a track is answered off the new balance by every replica")}`,
	async () => {
		const free = freeMessages();
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-replica-set1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		replicaSet().routeTo(0);
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});

		for (const { index, timeoutMs } of everyReplica())
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 60,
				timeoutMs,
			});
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-set2: a catalog change reaches every replica")}`,
	async () => {
		const free = freeMessages();
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-replica-set2",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		for (const index of [0, 1])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 100,
			});
		const featureId = `atom_replica_set2_${Date.now()}`;

		replicaSet().routeTo(0);
		await autumnV2_4.post("/features.create", {
			feature_id: featureId,
			name: "Atom replica set catalog",
			type: FeatureType.Boolean,
		});
		try {
			const apiAnswer = await autumnV2_4.post("/balances.check", {
				customer_id: customerId,
				feature_id: featureId,
			});
			for (const { index, timeoutMs } of everyReplica()) {
				const { body } = await pollUntilAsserted({
					fetch: () =>
						checkOnAtom({
							atom: replicaSet().replica(index),
							secretKey: defaultCtx.orgSecretKey,
							customerId,
							featureId,
						}),
					assert: ({ forwarded }) => expect(forwarded).toBeNull(),
					timeoutMs,
				});
				expect(body).toEqual(apiAnswer);
			}
		} finally {
			await autumnV2_4.post("/features.delete", { feature_id: featureId });
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-set3: a push missed across a cut link reaches the replica once the link heals")}`,
	async () => {
		const free = freeMessages();
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-replica-set3",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const [reached, cutOff] = [0, 1].map((index) => ({
			atom: replicaSet().replica(index),
			customerId,
		}));
		replicaSet().routeTo(0);
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await expectAtomBalance({ ...cutOff, remaining: 90 });

		await replicaSet().cutPeer(0, 1);
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		await expectAtomBalance({ ...reached, remaining: 60 });
		await expectAtomBalance({ ...cutOff, remaining: 90, timeoutMs: 0 });

		await replicaSet().healPeers();
		await expectAtomBalance({
			...cutOff,
			remaining: 60,
			timeoutMs: ANTI_ENTROPY_TIMEOUT_MS,
		});
	},
	ANTI_ENTROPY_TIMEOUT_MS + 120_000,
);
