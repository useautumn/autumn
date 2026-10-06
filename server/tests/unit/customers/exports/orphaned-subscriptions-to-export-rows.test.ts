import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	failedOrphanToExportRow,
	isBilledSubscription,
	orphanToExportRow,
	STRIPE_CUSTOMER_NOT_IN_AUTUMN,
} from "@/internal/customers/exports/verify/orphanedSubscriptionsToExportRows/orphanToExportRow.js";
import { readOrphanedStripeCustomer } from "@/internal/customers/exports/verify/orphanedSubscriptionsToExportRows/readOrphanedStripeCustomer.js";
import { createRatePacer } from "@/utils/createRatePacer.js";

const subscriptionWith = ({
	id,
	status,
}: {
	id: string;
	status: Stripe.Subscription.Status;
}) => ({ id, status }) as Stripe.Subscription;

const orphan = {
	stripeCustomerId: "cus_stripe_1",
	name: "Jane",
	email: "jane@example.com",
	subscriptionIds: ["sub_1", "sub_2"],
};

const ctx = { logger: { warn: () => {} } } as unknown as AutumnContext;
const pacer = createRatePacer({ requestsPerSecond: 1000 });

const fakeStripeCli = ({
	customer,
	subscriptions,
}: {
	customer: Partial<Stripe.Customer> | { deleted: true };
	subscriptions: Stripe.Subscription[];
}) =>
	({
		customers: { retrieve: async () => customer },
		subscriptions: { list: async () => ({ data: subscriptions }) },
	}) as unknown as Stripe;

describe("orphanToExportRow", () => {
	it("reports the Stripe customer with no Autumn customer id", () => {
		const row = orphanToExportRow({ orphan, possibleMatchIds: [] });
		expect(row).toEqual({
			customer_id: null,
			name: "Jane",
			email: "jane@example.com",
			stripe_customer_id: "cus_stripe_1",
			stripe_subscription_ids: "sub_1, sub_2",
			severity: "error",
			issues: STRIPE_CUSTOMER_NOT_IN_AUTUMN,
			details: `${STRIPE_CUSTOMER_NOT_IN_AUTUMN}: Stripe customer has a billed subscription but no Autumn customer is linked to it`,
		});
	});

	it("names same-email Autumn customers as possible matches", () => {
		const row = orphanToExportRow({
			orphan,
			possibleMatchIds: ["cus_a", "cus_b"],
		});
		expect(row.details).toEndWith(
			"Possible match (same email): Autumn customer cus_a, cus_b",
		);
	});

	it("turns a failed read into a verify_failed row", () => {
		const row = failedOrphanToExportRow({
			stripeCustomerId: "cus_stripe_1",
			error: new Error("timed out"),
		});
		expect(row.issues).toBe("verify_failed");
		expect(row.details).toBe("timed out");
		expect(row.stripe_customer_id).toBe("cus_stripe_1");
	});
});

describe("isBilledSubscription", () => {
	it("keeps only statuses a customer is billed on", () => {
		const statuses: Stripe.Subscription.Status[] = [
			"active",
			"trialing",
			"past_due",
			"unpaid",
			"incomplete",
			"incomplete_expired",
			"paused",
			"canceled",
		];
		const billed = statuses.filter((status) =>
			isBilledSubscription(subscriptionWith({ id: "sub", status })),
		);
		expect(billed).toEqual(["active", "trialing", "past_due", "unpaid"]);
	});
});

describe("readOrphanedStripeCustomer", () => {
	it("returns the live billed subscriptions with the Stripe customer's contact", async () => {
		const result = await readOrphanedStripeCustomer({
			ctx,
			pacer,
			stripeCustomerId: "cus_stripe_1",
			stripeCli: fakeStripeCli({
				customer: { name: "Jane", email: "jane@example.com" },
				subscriptions: [
					subscriptionWith({ id: "sub_active", status: "active" }),
					subscriptionWith({ id: "sub_abandoned", status: "incomplete" }),
				],
			}),
		});
		expect(result).toEqual({
			stripeCustomerId: "cus_stripe_1",
			name: "Jane",
			email: "jane@example.com",
			subscriptionIds: ["sub_active"],
		});
	});

	it("drops a deleted Stripe customer", async () => {
		const result = await readOrphanedStripeCustomer({
			ctx,
			pacer,
			stripeCustomerId: "cus_stripe_1",
			stripeCli: fakeStripeCli({
				customer: { deleted: true },
				subscriptions: [],
			}),
		});
		expect(result).toBeNull();
	});

	it("drops a customer whose subscriptions stopped billing since the sweep", async () => {
		const result = await readOrphanedStripeCustomer({
			ctx,
			pacer,
			stripeCustomerId: "cus_stripe_1",
			stripeCli: fakeStripeCli({
				customer: { name: null, email: null },
				subscriptions: [subscriptionWith({ id: "sub_1", status: "canceled" })],
			}),
		});
		expect(result).toBeNull();
	});
});

describe("readOrphanedStripeCustomer pagination", () => {
	it("reads every subscription page before deciding what is billed", async () => {
		const pages = [
			{
				data: [subscriptionWith({ id: "sub_canceled", status: "canceled" })],
				has_more: true,
			},
			{
				data: [subscriptionWith({ id: "sub_late", status: "active" })],
				has_more: false,
			},
		];
		const startingAfters: (string | undefined)[] = [];
		const stripeCli = {
			customers: { retrieve: async () => ({ name: "Jane", email: null }) },
			subscriptions: {
				list: async ({ starting_after }: { starting_after?: string }) => {
					startingAfters.push(starting_after);
					return pages[startingAfters.length - 1];
				},
			},
		} as unknown as Stripe;

		const result = await readOrphanedStripeCustomer({
			ctx,
			pacer,
			stripeCustomerId: "cus_stripe_1",
			stripeCli,
		});

		expect(startingAfters).toEqual([undefined, "sub_canceled"]);
		expect(result?.subscriptionIds).toEqual(["sub_late"]);
	});
});
