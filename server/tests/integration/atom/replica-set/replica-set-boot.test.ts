/**
 * A replica of an org's Atom starting up: it serves nothing stale and runs no check twice while it catches up.
 *
 * Contract:
 *  1. a replica killed and replaced on an empty volume copies every subject from a peer before it reports ready;
 *  2. a replica added by scaling up does the same;
 *  3. a check that sends an event, arriving while a replica boots, is answered exactly once: the balance moves once per allowed answer.
 */

import { expect, test } from "bun:test";
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
import { startTraffic } from "../utils/startTraffic.js";

const replicaSet = useReplicaSet({ size: 2 });
/** A replica boots in well under a second here, so a few tries make sure some checks land in that window. */
const BOOT_ATTEMPTS = 5;

const trackedCustomer = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_4 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	await autumnV2_4.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 25,
	});
	for (const index of [0, 1])
		await expectAtomBalance({
			atom: replicaSet().replica(index),
			customerId,
			remaining: 75,
		});
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-boot1: a replica on a fresh volume bootstraps from a peer before serving")}`,
	async () => {
		const customerId = "atom-replica-boot1";
		await trackedCustomer({ customerId });

		await replicaSet().kill(1);
		await replicaSet().wipeVolume(1);
		await replicaSet().start(1);

		await expectAtomBalance({
			atom: replicaSet().replica(1),
			customerId,
			remaining: 75,
			timeoutMs: 0,
		});
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-boot2: a replica added by scaling up bootstraps from a peer before serving")}`,
	async () => {
		const customerId = "atom-replica-boot2";
		await trackedCustomer({ customerId });

		await replicaSet().scaleTo(3);

		await expectAtomBalance({
			atom: replicaSet().replica(2),
			customerId,
			remaining: 75,
			timeoutMs: 0,
		});
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-boot3: a check arriving while a replica boots is answered exactly once")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10_000 })],
		});
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-replica-boot3",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const sendEventCheck = () =>
			checkOnAtom({
				atom: replicaSet(),
				secretKey: defaultCtx.orgSecretKey,
				customerId,
				featureId: TestFeature.Messages,
				sendEvent: true,
			});

		// A replica hands a check to a ready peer as starting only for a customer it owns; any other goes to its owner.
		const booting = await replicaSet().ownerIndexOf({ customerId });
		replicaSet().routeTo(booting);
		const answers: Awaited<ReturnType<typeof sendEventCheck>>[] = [];
		for (let attempt = 0; attempt < BOOT_ATTEMPTS; attempt++) {
			await replicaSet().stop(booting);
			const traffic = startTraffic({
				send: sendEventCheck,
				everyMs: 10,
				lanes: 4,
			});
			await replicaSet().start(booting);
			answers.push(...(await traffic.stop()));
			if (answers.some(({ proxied }) => proxied === "starting")) break;
		}

		const allowed = answers.filter(
			({ status, body }) =>
				status === 200 && (body as { allowed: boolean }).allowed,
		);
		await pollUntilAsserted({
			fetch: () =>
				autumnV2_4.post("/balances.check", {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				}),
			assert: (check) => expect(check.balance.usage).toBe(allowed.length),
		});
		expect(answers.filter(({ status }) => status === 504)).toHaveLength(0);
		// Some checks did land while it booted: another replica answered them.
		expect(answers.some(({ proxied }) => proxied === "starting")).toBe(true);
	},
	180_000,
);
