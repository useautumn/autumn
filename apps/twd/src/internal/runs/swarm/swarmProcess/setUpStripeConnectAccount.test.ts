import { expect, test } from "bun:test";
import { ensureStripeConnectWebhook } from "@tw/helpers/stripeConnectShard.ts";
import { acquireStripeConnectLease } from "../stripeConnectLease.ts";
import { setUpStripeConnectAccount } from "./setUpStripeConnectAccount.ts";

const url = "https://twd.example/ingress/connect/sandbox?shard=stripe-connect";
const events = ["account.application.deauthorized"];

/** One Stripe account's endpoints; listing is slow so unserialized callers both see it empty. */
const fakeShardStripe = () => {
	const endpoints: {
		id: string;
		url: string;
		enabled_events: string[];
		status: string;
		metadata: Record<string, string>;
	}[] = [];
	return {
		endpoints,
		webhookEndpoints: {
			list: () =>
				(async function* () {
					const snapshot = [...endpoints];
					await Bun.sleep(10);
					yield* snapshot;
				})(),
			create: async (params: {
				url: string;
				enabled_events: string[];
				metadata: Record<string, string>;
			}) => {
				const endpoint = {
					id: `we_${endpoints.length}`,
					status: "enabled",
					...params,
				};
				endpoints.push(endpoint);
				return endpoint;
			},
			update: async (id: string) => ({ id }),
		},
	};
};

/** What one run does: lease, then lazy webhook, then its sub-account; the lease is held until the run ends. */
const runSetup = async ({
	stripe,
	runId,
	reported,
}: {
	stripe: ReturnType<typeof fakeShardStripe>;
	runId: string;
	reported: string[];
}) => {
	let release = () => {};
	const accountId = await setUpStripeConnectAccount({
		waitForLease: async () => {
			release = await acquireStripeConnectLease();
		},
		isCancelled: () => false,
		ensureWebhook: () => ensureStripeConnectWebhook({ stripe, url, events }),
		createAccount: async () => `acct_${runId}`,
		reportAccount: (id) => reported.push(id),
	});
	release();
	return accountId;
};

test("concurrent first runs create the shard webhook once", async () => {
	const stripe = fakeShardStripe();
	const reported: string[] = [];
	const accounts = await Promise.all([
		runSetup({ stripe, runId: "a", reported }),
		runSetup({ stripe, runId: "b", reported }),
	]);
	expect(accounts).toEqual(["acct_a", "acct_b"]);
	expect(stripe.endpoints).toHaveLength(1);
});

test("a run cancelled while its sub-account is being created still reports it for deletion", async () => {
	let cancelled = false;
	const reported: string[] = [];
	const accountId = await setUpStripeConnectAccount({
		waitForLease: async () => {},
		isCancelled: () => cancelled,
		ensureWebhook: async () => ({ id: "we_1" }),
		createAccount: async () => {
			cancelled = true;
			return "acct_late";
		},
		reportAccount: (id) => reported.push(id),
	});
	expect(accountId).toBeNull();
	expect(reported).toEqual(["acct_late"]);
});

test("a run cancelled while waiting for the lease touches nothing", async () => {
	const touched: string[] = [];
	const accountId = await setUpStripeConnectAccount({
		waitForLease: async () => {},
		isCancelled: () => true,
		ensureWebhook: async () => {
			touched.push("webhook");
			return { id: "we_1" };
		},
		createAccount: async () => {
			touched.push("account");
			return "acct_x";
		},
		reportAccount: () => touched.push("report"),
	});
	expect(accountId).toBeNull();
	expect(touched).toEqual([]);
});
