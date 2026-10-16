import { describe, expect, test } from "bun:test";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import {
	KafkaJSConnectionError,
	KafkaJSNumberOfRetriesExceeded,
} from "kafkajs";
import { runBalanceWorkerBatchTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerBatchTrack.js";
import { toBatchTrackEntries } from "@/internal/balances/track/batchTrackEntries.js";
import { runBalanceWorkerAsyncUpdateBalance } from "@/internal/balances/updateBalance/balanceWorker/runBalanceWorkerAsyncUpdateBalance.js";
import { createCustomerFixture } from "./customer-fixture.js";

/** The client a broker roll leaves behind: every append fails the way prod's producer did on 15 Oct. */
const clientWithFailingBroker = () =>
	createBalanceWorkerClient({
		ctx: {
			owners: { findOwner: () => undefined, refresh: async () => undefined },
			http: { postJson: async () => ({ status: 500, body: null }) },
			commandLog: {
				append: async () =>
					Promise.reject(
						new KafkaJSNumberOfRetriesExceeded(
							new KafkaJSConnectionError("Closed connection"),
							{ retryCount: 3, retryTime: 1_000 },
						),
					),
			},
		},
		config: { partitionCount: 1, timeoutMs: 1_000 },
	});

const resultUnknown = {
	statusCode: 503,
	code: "balance_worker_result_unknown",
};

describe("a driver failure on the command log answers the designed 503, never a raw 500", () => {
	test("batch track", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		await expect(
			runBalanceWorkerBatchTrack({
				ctx,
				entries: toBatchTrackEntries({
					body: [
						{ customer_id: fullSubject.customerId, feature_id: "messages" },
					],
				}),
				client: clientWithFailingBroker(),
			}),
		).rejects.toMatchObject(resultUnknown);
	});

	test("async balance update", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const params: UpdateBalanceParamsV0 = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			usage: 5,
		};
		await expect(
			runBalanceWorkerAsyncUpdateBalance({
				ctx,
				params,
				client: clientWithFailingBroker(),
			}),
		).rejects.toMatchObject(resultUnknown);
	});
});
