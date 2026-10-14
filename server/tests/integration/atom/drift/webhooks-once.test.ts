/**
 * Balance webhooks for deductions an Atom handed in, and for the same journal handed in again (a resend after a lost
 * reply, or a restarted replica replaying its journal under fresh request ids).
 *
 * Contract: each crossing fires its webhook exactly once, whatever path and however often the journal is resent:
 *  1. a usage alert at 50 crossed by a handed-in track of 60, and `balances.limit_reached` (included) when a second
 *     track of 40 spends the rest: one of each, after the batch is resent identically and again under fresh request ids;
 *     and one usage event per track.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ATOM_TRACKS_APPEND_PATH } from "@autumn/byoc";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { setCustomerUsageAlerts } from "@tests/integration/balances/utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	countUsageAlertWebhooks,
	waitForUsageAlertCount,
} from "@tests/integration/balances/utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { timeout } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { atomTrack, postAsAtom } from "../utils/atomHandIn.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "../utils/ensureAtomDeployment.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";

const autumn = atomTestClient();
const USAGE_ALERT = "balances.usage_alert_triggered";
const LIMIT_REACHED = "balances.limit_reached";
/** Long enough for a duplicate webhook behind the first to arrive. */
const DUPLICATE_SETTLE_MS = 10_000;

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: defaultCtx.org.svix_config }),
		filterTypes: [USAGE_ALERT, LIMIT_REACHED],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
	await deleteAtomDeployment({ autumn });
});

const countLimitReached = async ({ customerId }: { customerId: string }) => {
	const history = await getPlayHistory({ token: webhook.playToken });
	return history.data
		.map((event) =>
			parseEventBody<{ type: string; data?: { customer_id?: string } }>(event),
		)
		.filter(
			(payload) =>
				payload.type === LIMIT_REACHED &&
				payload.data?.customer_id === customerId,
		).length;
};

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("webhooks-once1: a handed-in journal fires each balance webhook once, however often it is resent")}`,
	async () => {
		const customerId = "webhooks-once1";
		const { autumnV2_1 } = await initMessagesCustomer({
			customerId,
			atom: () => ensureAtomDeployment({ autumn }),
		});
		await setCustomerUsageAlerts({
			autumn: autumnV2_1,
			customerId,
			usageAlerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 50,
					threshold_type: "usage",
					enabled: true,
				},
			],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const tokenHash = atomTokenToHash({ token: atom.token });
		const writerId = `w_${crypto.randomUUID()}`;
		// As the Atom journals a track: with its usage event.
		const trackOf = (value: number) => ({
			...atomTrack({ customerId, value }),
			usageEvent: {
				name: TestFeature.Messages,
				idempotencyKey: null,
				id: null,
			},
		});
		const journal = () => [
			{ writerId, seq: 1, command: trackOf(60) },
			{ writerId, seq: 2, command: trackOf(40) },
		];
		const append = async (tracks: ReturnType<typeof journal>) => {
			const reply = await postAsAtom({
				autumn,
				path: ATOM_TRACKS_APPEND_PATH,
				tokenHash,
				body: { tracks },
			});
			expect(reply.status).toBe(204);
		};

		const firstSend = journal();
		await append(firstSend);
		await expectAutumnLockState({ customerId, atomSeqs: [2] });
		await append(firstSend);
		await append(journal());

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 0,
		});
		await waitForUsageAlertCount({
			token: webhook.playToken,
			customerId,
			threshold: 50,
			count: 1,
		});
		await timeout(DUPLICATE_SETTLE_MS);
		expect({
			usageAlerts: await countUsageAlertWebhooks({
				token: webhook.playToken,
				customerId,
				threshold: 50,
			}),
			limitReached: await countLimitReached({ customerId }),
		}).toEqual({ usageAlerts: 1, limitReached: 1 });
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 40 }, { value: 60 }],
		});
	},
	180_000,
);
