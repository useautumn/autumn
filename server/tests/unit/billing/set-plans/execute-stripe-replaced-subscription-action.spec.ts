import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type StripeErrorFields = { code?: string; type?: string; statusCode?: number };

const stripeState = {
	cancelErrors: [] as Error[],
	cancelCalls: 0,
	cancelParams: undefined as Stripe.SubscriptionCancelParams | undefined,
	retrievedStatus: "incomplete" as Stripe.Subscription.Status,
	retrievedSchedule: null as string | null,
	calls: [] as string[],
};
const loggedErrors: string[] = [];

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			cancel: async (id: string, params?: Stripe.SubscriptionCancelParams) => {
				stripeState.cancelCalls++;
				stripeState.cancelParams = params;
				stripeState.calls.push(`cancel ${id}`);
				const cancelError = stripeState.cancelErrors.shift();
				if (cancelError) throw cancelError;
				return { id, status: "canceled" };
			},
			retrieve: async (id: string) => ({
				id,
				status: stripeState.retrievedStatus,
				schedule: stripeState.retrievedSchedule,
			}),
		},
		subscriptionSchedules: {
			release: async (id: string) => {
				stripeState.calls.push(`release ${id}`);
				stripeState.retrievedSchedule = null;
				return { id, status: "released" };
			},
		},
	}),
}));

const { executeStripeReplacedSubscriptionAction } = await import(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeReplacedSubscriptionAction"
);

const ctx = {
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		info: () => {},
		warn: () => {},
		error: (message: string) => loggedErrors.push(message),
	},
} as unknown as AutumnContext;

const cancelReplaced = ({
	reason,
	stripeSubscriptionScheduleId,
}: {
	reason?: "backdate";
	stripeSubscriptionScheduleId?: string;
} = {}) =>
	executeStripeReplacedSubscriptionAction({
		ctx,
		fullCustomer: {
			id: "cus_123",
			customer_products: [],
		} as unknown as FullCustomer,
		replacedSubscriptionAction: {
			type: "cancel",
			stripeSubscriptionId: "sub_old",
			stripeSubscriptionScheduleId,
			reason,
		},
	});

const stripeError = (fields: StripeErrorFields = {}) =>
	Object.assign(new Error("stripe rejected the cancel"), fields);

const stripeRateLimitError = () =>
	stripeError({ type: "StripeRateLimitError", statusCode: 429 });

describe("executeStripeReplacedSubscriptionAction", () => {
	beforeEach(() => {
		stripeState.cancelErrors = [];
		stripeState.cancelCalls = 0;
		stripeState.cancelParams = undefined;
		stripeState.retrievedStatus = "incomplete";
		stripeState.retrievedSchedule = null;
		stripeState.calls = [];
		loggedErrors.length = 0;
	});

	test("a subscription another request already cancelled counts as cancelled", async () => {
		stripeState.cancelErrors = [stripeError()];
		stripeState.retrievedStatus = "canceled";

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a subscription Stripe no longer has counts as cancelled", async () => {
		stripeState.cancelErrors = [stripeError({ code: "resource_missing" })];

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a failed cancel is logged and doesn't stop the new plan applying", async () => {
		stripeState.cancelErrors = [stripeError()];

		await cancelReplaced();

		expect(loggedErrors).toHaveLength(1);
		expect(loggedErrors[0]).toContain("sub_old");
		expect(loggedErrors[0]).toContain("cus_123");
	});

	test("a transiently rejected cancel is retried until Stripe accepts it", async () => {
		stripeState.cancelErrors = [stripeRateLimitError()];

		await cancelReplaced();

		expect(stripeState.cancelCalls).toBe(2);
		expect(loggedErrors).toEqual([]);
	});

	test("a subscription recreated for a backdate is cancelled without proration or a final invoice", async () => {
		stripeState.retrievedStatus = "active";

		await cancelReplaced({ reason: "backdate" });

		expect(stripeState.cancelParams).toEqual({
			prorate: false,
			invoice_now: false,
		});
	});

	test("a scheduled subscription recreated for a backdate has its schedule released before it is cancelled", async () => {
		stripeState.retrievedStatus = "active";
		stripeState.retrievedSchedule = "sub_sched_old";

		await cancelReplaced({
			reason: "backdate",
			stripeSubscriptionScheduleId: "sub_sched_old",
		});

		expect(stripeState.calls).toEqual([
			"release sub_sched_old",
			"cancel sub_old",
		]);
		expect(loggedErrors).toEqual([]);
	});

	test("a schedule a retry already released is not released again", async () => {
		stripeState.retrievedStatus = "active";

		await cancelReplaced({
			reason: "backdate",
			stripeSubscriptionScheduleId: "sub_sched_old",
		});

		expect(stripeState.calls).toEqual(["cancel sub_old"]);
	});

	test("a cancel Stripe rejects outright is not retried", async () => {
		stripeState.cancelErrors = [
			stripeError({ type: "StripeInvalidRequestError", statusCode: 400 }),
		];

		await cancelReplaced();

		expect(stripeState.cancelCalls).toBe(1);
		expect(loggedErrors).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
