import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { findQueuedCustomerProducts } from "@/internal/billing/v2/actions/sync/setup/findQueuedCustomerProducts";

const STRIPE_SCHEDULE_ID = "sub_sched_123";

const customerProduct = ({
	id,
	status,
	scheduledIds = [],
}: {
	id: string;
	status: CusProductStatus;
	scheduledIds?: string[];
}) =>
	({ id, status, scheduled_ids: scheduledIds }) as unknown as FullCusProduct;

describe("findQueuedCustomerProducts", () => {
	test("keeps scheduled rows Autumn's schedule lists", () => {
		const listed = customerProduct({
			id: "cus_prod_listed",
			status: CusProductStatus.Scheduled,
		});

		const queued = findQueuedCustomerProducts({
			customerProducts: [listed],
			autumnScheduledCustomerProductIds: new Set([listed.id]),
			stripeScheduleId: STRIPE_SCHEDULE_ID,
		});

		expect(queued).toEqual([listed]);
	});

	test("keeps a scheduled row linked only to the Stripe schedule, with no Autumn schedule", () => {
		const linkedOnlyInStripe = customerProduct({
			id: "cus_prod_stripe_linked",
			status: CusProductStatus.Scheduled,
			scheduledIds: [STRIPE_SCHEDULE_ID],
		});

		const queued = findQueuedCustomerProducts({
			customerProducts: [linkedOnlyInStripe],
			autumnScheduledCustomerProductIds: new Set(),
			stripeScheduleId: STRIPE_SCHEDULE_ID,
		});

		expect(queued).toEqual([linkedOnlyInStripe]);
	});

	test("ignores scheduled rows on another Stripe schedule, and non-scheduled rows", () => {
		const otherSchedule = customerProduct({
			id: "cus_prod_other_schedule",
			status: CusProductStatus.Scheduled,
			scheduledIds: ["sub_sched_other"],
		});
		const activeOnSchedule = customerProduct({
			id: "cus_prod_active",
			status: CusProductStatus.Active,
			scheduledIds: [STRIPE_SCHEDULE_ID],
		});

		const queued = findQueuedCustomerProducts({
			customerProducts: [otherSchedule, activeOnSchedule],
			autumnScheduledCustomerProductIds: new Set(),
			stripeScheduleId: STRIPE_SCHEDULE_ID,
		});

		expect(queued).toEqual([]);
	});
});
