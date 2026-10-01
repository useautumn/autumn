import { expect, test } from "bun:test";
import { deleteStripeConnectAccounts } from "./deleteStripeConnectAccounts.ts";

const logger = { warn: () => {}, info: () => {}, error: () => {} };
const shardMeta = (runId: string) => ({
	autumn_tw_shard: "stripe-connect",
	autumn_tw_run: runId,
});

const PAGE = 2;

const fakeStripe = ({
	listed = [],
	fail = {},
	listFailures = [],
}: {
	listed?: { id: string; metadata: Record<string, string> | null }[];
	fail?: Record<string, unknown[]>;
	listFailures?: unknown[];
}) => {
	const deleted: string[] = [];
	return {
		deleted,
		stripe: {
			accounts: {
				list: async (params: { limit: number; starting_after?: string }) => {
					const error = listFailures.shift();
					if (error) throw error;
					const start = params.starting_after
						? listed.findIndex(({ id }) => id === params.starting_after) + 1
						: 0;
					const page = listed.slice(start, start + PAGE);
					return { data: page, has_more: start + PAGE < listed.length };
				},
				del: async (id: string) => {
					const error = fail[id]?.shift();
					if (error) throw error;
					deleted.push(id);
					return { id, deleted: true };
				},
			},
		},
	};
};

test("deletes the reported accounts plus any the run created but never reported", async () => {
	const { stripe, deleted } = fakeStripe({
		listed: [
			{ id: "acct_unreported", metadata: shardMeta("run_1") },
			{ id: "acct_reported", metadata: shardMeta("run_1") },
			{ id: "acct_other_run", metadata: shardMeta("run_2") },
			{ id: "acct_untagged", metadata: { autumn_tw_run: "run_1" } },
		],
	});
	const failed = await deleteStripeConnectAccounts({
		runId: "run_1",
		accountIds: ["acct_reported"],
		stripe,
		logger: logger as never,
	});
	expect(deleted.sort()).toEqual(["acct_reported", "acct_unreported"]);
	expect(failed).toEqual([]);
});

test("retries rate limits and treats every already-gone error as deleted", async () => {
	const { stripe, deleted } = fakeStripe({
		fail: {
			acct_limited: [{ statusCode: 429, message: "Too many requests" }],
			acct_gone: [{ message: "No such account: acct_gone" }],
			acct_lost: [{ code: "account_invalid", message: "lost access" }],
		},
	});
	const failed = await deleteStripeConnectAccounts({
		runId: "run_1",
		accountIds: ["acct_limited", "acct_gone", "acct_lost"],
		stripe,
		logger: logger as never,
	});
	expect(deleted).toEqual(["acct_limited"]);
	expect(failed).toEqual([]);
});

test("a delete that keeps failing is returned, not thrown", async () => {
	const { stripe } = fakeStripe({
		fail: { acct_a: [new Error("Stripe is down")] },
	});
	expect(
		await deleteStripeConnectAccounts({
			runId: "run_1",
			accountIds: ["acct_a"],
			stripe,
			logger: logger as never,
		}),
	).toEqual(["acct_a"]);
});

test("a rate-limited sweep page is retried, so unreported accounts are still found", async () => {
	const { stripe, deleted } = fakeStripe({
		listed: [
			{ id: "acct_x", metadata: null },
			{ id: "acct_y", metadata: null },
			{ id: "acct_late", metadata: shardMeta("run_1") },
		],
		listFailures: [{ statusCode: 429, message: "Too many requests" }],
	});
	await deleteStripeConnectAccounts({
		runId: "run_1",
		accountIds: [],
		stripe,
		logger: logger as never,
	});
	expect(deleted).toEqual(["acct_late"]);
});
