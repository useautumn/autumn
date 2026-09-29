import { describe, expect, test } from "bun:test";
import type { SubscriptionMismatch, SyncProposalV2 } from "@autumn/shared";
import { proposalSyncSummary } from "@/views/customers2/components/sync-stripe-v2/proposalSyncSummary";

const JAN_1_2027 = Date.UTC(2027, 0, 1, 12);
const productNamesById = { team: "Team", pro: "Pro", premium: "Premium" };

const proposal = ({
	linkedPlanId = null,
	phases = [{ starts_at: "now", plans: [] }],
}: {
	linkedPlanId?: string | null;
	phases?: { starts_at: number | "now"; plans: { plan_id: string }[] }[];
}) =>
	({
		stripe_subscription_id: "sub_123",
		phases,
		stripe_subscription: null,
		stripe_schedule: null,
		already_linked_product_id: linkedPlanId,
	}) as unknown as SyncProposalV2;

const seatMismatch = {
	type: "prepaid_quantity_mismatch",
	message: "Stripe bills 5 seats, Autumn expects 3",
} as SubscriptionMismatch;

describe("proposalSyncSummary", () => {
	test("an unlinked subscription with no matching plan has no match", () => {
		expect(
			proposalSyncSummary({
				proposal: proposal({}),
				mismatches: [],
				productNamesById,
			}),
		).toEqual({
			state: "no_match",
			planNames: [],
			note: "No Autumn plan uses these prices",
		});
	});

	test("an unlinked subscription with matched plans is ready to link", () => {
		const summary = proposalSyncSummary({
			proposal: proposal({
				phases: [{ starts_at: "now", plans: [{ plan_id: "pro" }] }],
			}),
			mismatches: [],
			productNamesById,
		});
		expect(summary.state).toBe("ready_to_link");
		expect(summary.note).toBe("Matches Pro");
	});

	test("a linked subscription with a verify mismatch is out of sync", () => {
		const summary = proposalSyncSummary({
			proposal: proposal({ linkedPlanId: "team" }),
			mismatches: [seatMismatch],
			productNamesById,
		});
		expect(summary).toEqual({
			state: "out_of_sync",
			planNames: ["Team"],
			note: "Stripe bills 5 seats, Autumn expects 3",
		});
	});

	test("a linked subscription with a later phase has a scheduled change", () => {
		const summary = proposalSyncSummary({
			proposal: proposal({
				linkedPlanId: "pro",
				phases: [
					{ starts_at: "now", plans: [{ plan_id: "pro" }] },
					{ starts_at: JAN_1_2027, plans: [{ plan_id: "premium" }] },
				],
			}),
			mismatches: [],
			productNamesById,
		});
		expect(summary.state).toBe("change_scheduled");
		expect(summary.note).toBe("Moves to Premium on Jan 1, 2027");
	});

	test("a linked subscription with no mismatches is in sync", () => {
		expect(
			proposalSyncSummary({
				proposal: proposal({ linkedPlanId: "pro" }),
				mismatches: [],
				productNamesById,
			}).state,
		).toBe("in_sync");
	});

	test("a linked subscription is only linked until verify has loaded", () => {
		const summary = proposalSyncSummary({
			proposal: proposal({ linkedPlanId: "pro" }),
			mismatches: undefined,
			productNamesById,
		});
		expect(summary.state).toBe("linked");
		expect(summary.note).toBe("Linked to Pro");
	});
});
