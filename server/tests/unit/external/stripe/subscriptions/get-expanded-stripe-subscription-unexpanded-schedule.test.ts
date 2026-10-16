import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const scheduleId = "sub_sched_123";
const trialEnd = 1_800_000_000;

const stripeCli = {
	subscriptions: {
		retrieve: async () => ({
			id: "sub_123",
			schedule: scheduleId,
			trial_end: null,
		}),
	},
	subscriptionSchedules: {
		retrieve: async (id: string) => ({
			id,
			phases: [{ trial_end: trialEnd }],
		}),
	},
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => stripeCli,
}));

const { getExpandedStripeSubscription } = await import(
	"@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js"
);
const { stripeSubscriptionToTrialEndsAtMs } = await import(
	"@/external/stripe/subscriptions/utils/convertStripeSubscription.js"
);

describe("getExpandedStripeSubscription", () => {
	test("loads the schedule when Stripe returns it unexpanded mid-creation", async () => {
		const stripeSubscription = await getExpandedStripeSubscription({
			ctx: { org: {}, env: "live" } as unknown as AutumnContext,
			subscriptionId: "sub_123",
		});

		expect(stripeSubscriptionToTrialEndsAtMs({ stripeSubscription })).toBe(
			trialEnd * 1000,
		);
		expect(stripeSubscription.schedule.id).toBe(scheduleId);
	});
});
