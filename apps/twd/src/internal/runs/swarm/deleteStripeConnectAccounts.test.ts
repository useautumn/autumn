import { expect, test } from "bun:test";
import { deleteStripeConnectAccounts } from "./deleteStripeConnectAccounts.ts";

const logger = { warn: () => {}, info: () => {}, error: () => {} };

test("every dedicated sub-account is deleted, tolerating ones already gone", async () => {
	const deleted: string[] = [];
	const stripe = {
		accounts: {
			del: async (id: string) => {
				deleted.push(id);
				if (id === "acct_gone")
					throw Object.assign(new Error("No such account"), {
						code: "resource_missing",
					});
				return { id, deleted: true };
			},
		},
	};
	const failed = await deleteStripeConnectAccounts({
		accountIds: ["acct_a", "acct_gone", "acct_b"],
		stripe,
		logger: logger as never,
	});
	expect(deleted).toEqual(["acct_a", "acct_gone", "acct_b"]);
	expect(failed).toEqual([]);
});

test("a failed delete is reported, not thrown, so cleanup carries on", async () => {
	const stripe = {
		accounts: {
			del: async () => {
				throw new Error("Stripe is down");
			},
		},
	};
	expect(
		await deleteStripeConnectAccounts({
			accountIds: ["acct_a"],
			stripe,
			logger: logger as never,
		}),
	).toEqual(["acct_a"]);
});
