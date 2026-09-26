import { beforeEach, describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	fullSubjectToCustomerEntitlements,
	getApiBalanceV2,
	InsufficientBalanceError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCustomerFixture } from "./customer-fixture.js";

const { ctx, fullSubject, feature } = createCustomerFixture();
const lane: string[] = [];
const postgresBodies: TrackParams[] = [];
let postgresTrack: () => Promise<TrackResponseV3>;

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	() => ({
		getBalanceWorkerClient: () => ({
			evict: async () => {
				lane.push("evict");
				return { evicted: true };
			},
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	() => ({
		getFullSubject: async () => {
			lane.push("read");
			return fullSubject;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runPostgresTrackV3.js",
	() => ({
		runPostgresTrackV3: async ({ body }: { body: TrackParams }) => {
			lane.push("postgres");
			postgresBodies.push(body);
			return postgresTrack();
		},
	}),
);
const { runBalanceWorkerCheck } = await import(
	"@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js"
);

const paidAllocatedRefusal = new BalanceWorkerClientError({
	code: "WORKER_ERROR",
	outcome: "not_submitted",
	message: "Unsupported command: paid_allocated_not_supported",
	workerCode: "UNSUPPORTED_COMMAND",
	workerReason: "paid_allocated_not_supported",
});

const refusingClient = {
	check: async () => {
		throw new Error("a deducting check never asks the worker a plain check");
	},
	track: async () => {
		throw paidAllocatedRefusal;
	},
};

const sendEventBody = {
	customer_id: "cus_test",
	feature_id: "messages",
	required_balance: 3,
	send_event: true,
};

beforeEach(() => {
	lane.length = 0;
	postgresBodies.length = 0;
});

describe("deducting check on a v1 paid allocated grant", () => {
	test("a refused Postgres track is a denied check reporting the balance it was refused against", async () => {
		postgresTrack = async () => {
			throw new InsufficientBalanceError({ featureId: "messages", value: 3 });
		};
		const checked = await runBalanceWorkerCheck({
			ctx,
			body: sendEventBody,
			client: refusingClient,
		});
		expect(lane).toEqual(["evict", "read", "postgres", "evict"]);
		expect(postgresBodies[0]).toMatchObject({
			feature_id: "messages",
			value: 3,
			overage_behavior: "reject",
		});
		expect(checked).toMatchObject({
			allowed: false,
			customer_id: "cus_test",
			required_balance: 3,
			balance: { feature_id: "messages", granted: 110, remaining: 72 },
		});
	});

	test("an applied Postgres track is an allowed check with the tracked balance", async () => {
		const heldBalance = getApiBalanceV2({
			ctx,
			fullSubject,
			customerEntitlements: fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [feature.id],
			}),
			feature,
		}).data;
		postgresTrack = async () => ({
			customer_id: "cus_test",
			value: 3,
			balance: { ...heldBalance, remaining: 69 },
		});
		const checked = await runBalanceWorkerCheck({
			ctx,
			body: sendEventBody,
			client: refusingClient,
		});
		expect(lane).toEqual(["evict", "read", "postgres", "evict"]);
		expect(checked).toMatchObject({
			allowed: true,
			required_balance: 3,
			balance: { feature_id: "messages", remaining: 69 },
		});
	});
});
