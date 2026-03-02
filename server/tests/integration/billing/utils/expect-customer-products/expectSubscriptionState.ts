import { expect } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { formatMs } from "@autumn/shared";

type V5CustomerOrEntity = ApiCustomerV5 | ApiEntityV2;
type SubscriptionState =
	| "active"
	| "canceling"
	| "scheduled"
	| "past_due"
	| "undefined";

/** Find a subscription by plan_id. */
const findSubscription = ({
	customer,
	productId,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => customer.subscriptions.find((sub) => sub.plan_id === productId);

/** Find a purchase by plan_id. */
const findPurchase = ({
	customer,
	productId,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => customer.purchases.find((p) => p.plan_id === productId);

/** Verify a V5 customer/entity has the expected subscription in the expected state. */
export const expectSubscriptionCorrect = async ({
	customer,
	productId,
	state,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
	state: SubscriptionState;
}) => {
	const sub = findSubscription({ customer, productId });

	if (state === "undefined") {
		const purchase = findPurchase({ customer, productId });
		expect(sub, `Subscription ${productId} should not exist`).toBeUndefined();
		expect(purchase, `Purchase ${productId} should not exist`).toBeUndefined();
		return;
	}

	if (!sub) {
		throw new Error(
			`Subscription ${productId} not found but expected state: ${state}`,
		);
	}

	if (state === "active") {
		expect(
			sub.status,
			`Subscription ${productId} should have status "active" but got "${sub.status}"`,
		).toBe("active");
		expect(
			sub.canceled_at,
			`Subscription ${productId} should not be canceling (canceled_at: ${sub.canceled_at})`,
		).toBeNull();
		expect(
			sub.past_due,
			`Subscription ${productId} should not be past_due`,
		).toBe(false);
	} else if (state === "canceling") {
		expect(
			sub.status,
			`Subscription ${productId} should have status "active" but got "${sub.status}"`,
		).toBe("active");
		expect(
			sub.canceled_at,
			`Subscription ${productId} should be canceling (canceled_at should be set)`,
		).not.toBeNull();
	} else if (state === "scheduled") {
		expect(
			sub.status,
			`Subscription ${productId} should have status "scheduled" but got "${sub.status}"`,
		).toBe("scheduled");
	} else if (state === "past_due") {
		expect(
			sub.past_due,
			`Subscription ${productId} should be past_due`,
		).toBe(true);
	}
};

/** Verify subscription is active. */
export const expectSubscriptionActive = async (params: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => expectSubscriptionCorrect({ ...params, state: "active" });

/** Verify subscription is canceling (active with canceled_at set). */
export const expectSubscriptionCanceling = async (params: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => expectSubscriptionCorrect({ ...params, state: "canceling" });

/** Verify subscription is scheduled. Optionally check started_at. */
export const expectSubscriptionScheduled = async ({
	customer,
	productId,
	startsAt,
	toleranceMs = 2 * 60 * 1000,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
	startsAt?: number;
	toleranceMs?: number;
}) => {
	await expectSubscriptionCorrect({ customer, productId, state: "scheduled" });

	if (startsAt !== undefined) {
		const sub = findSubscription({ customer, productId });
		if (!sub) {
			throw new Error(`Subscription ${productId} not found for startsAt check`);
		}

		const actualStartsAt = sub.started_at;
		const diff = Math.abs(actualStartsAt - startsAt);

		expect(
			diff <= toleranceMs,
			`Subscription ${productId} started_at (${formatMs(actualStartsAt)}) should be within ${toleranceMs}ms of expected (${formatMs(startsAt)}), diff: ${diff}ms`,
		).toBe(true);
	}
};

/** Verify subscription is past_due. */
export const expectSubscriptionPastDue = async (params: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => expectSubscriptionCorrect({ ...params, state: "past_due" });

/** Verify subscription/purchase does not exist. */
export const expectSubscriptionNotPresent = async (params: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => expectSubscriptionCorrect({ ...params, state: "undefined" });

/** Verify multiple subscription states in a single call. */
export const expectSubscriptions = async ({
	customer,
	active = [],
	canceling = [],
	scheduled = [],
	pastDue = [],
	notPresent = [],
}: {
	customer: V5CustomerOrEntity;
	active?: string[];
	canceling?: string[];
	scheduled?: string[];
	pastDue?: string[];
	notPresent?: string[];
}) => {
	for (const productId of active) {
		await expectSubscriptionCorrect({ customer, productId, state: "active" });
	}
	for (const productId of canceling) {
		await expectSubscriptionCorrect({
			customer,
			productId,
			state: "canceling",
		});
	}
	for (const productId of scheduled) {
		await expectSubscriptionCorrect({
			customer,
			productId,
			state: "scheduled",
		});
	}
	for (const productId of pastDue) {
		await expectSubscriptionCorrect({
			customer,
			productId,
			state: "past_due",
		});
	}
	for (const productId of notPresent) {
		await expectSubscriptionCorrect({
			customer,
			productId,
			state: "undefined",
		});
	}
};
