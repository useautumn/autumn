import { expect } from "bun:test";
import type { BillingChangeResponse, CustomerPlanChange } from "@autumn/shared";
import { waitForWebhook } from "@tests/integration/utils/svixWebhookTestUtils.js";

export type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse;
};

/** Attaches in test setup emit their own billing.updated (`activated`);
 * migration deliveries are identified by carrying an `updated` change. */
const hasUpdatedChange = (payload: BillingUpdatedPayload): boolean =>
	payload.data?.plan_changes?.some((change) => change.action === "updated") ??
	false;

const findPlanChange = (
	planChanges: CustomerPlanChange[] | undefined,
	planId: string,
): CustomerPlanChange | undefined =>
	planChanges?.find(
		(change) =>
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId,
	);

/** Top-level item_changes is deprecated; content lives on plan_change. The
 * fallback covers lanes that still populate the top-level field. */
export const getWebhookItemChanges = (
	change: CustomerPlanChange | undefined,
): CustomerPlanChange["item_changes"] => {
	const nested = change?.plan_change?.item_changes;
	return nested?.length ? nested : (change?.item_changes ?? []);
};

/**
 * Polls Svix Play for a billing.updated delivery for `customerId`. Returns
 * the payload data, or null when none arrives in time (absence assertions).
 * `entityId: null` requires a customer-level delivery; a string requires that
 * entity's delivery; omitted matches either.
 */
export const waitForBillingUpdatedWebhook = async ({
	playToken,
	customerId,
	entityId,
	requireUpdatedChange = true,
	timeoutMs = 15_000,
}: {
	playToken: string;
	customerId: string;
	entityId?: string | null;
	requireUpdatedChange?: boolean;
	timeoutMs?: number;
}): Promise<BillingChangeResponse | null> => {
	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(entityId === undefined ||
				(entityId === null
					? payload.data?.entity_id == null
					: payload.data?.entity_id === entityId)) &&
			(!requireUpdatedChange || hasUpdatedChange(payload)),
		timeoutMs,
		logWebhook: false,
	});
	return result?.payload.data ?? null;
};

type PlanChangeExpectation = {
	planId: string;
	action?: CustomerPlanChange["action"];
	/** Snapshot flavor the change must carry. Defaults to subscription. */
	kind?: "subscription" | "purchase";
	status?: string;
	itemChanges?: {
		action: "created" | "deleted";
		featureId: string;
		included?: number;
	}[];
};

/** Declarative assertions over a delivered billing.updated payload. Only the
 * fields provided are checked, expectBalanceCorrect-style. */
export const expectBillingUpdatedCorrect = ({
	data,
	customerId,
	entityId,
	planChanges,
}: {
	data: BillingChangeResponse | null;
	customerId: string;
	/** null asserts a customer-level payload (no entity_id). */
	entityId?: string | null;
	planChanges?: PlanChangeExpectation[];
}) => {
	expect(data).not.toBeNull();
	expect(data?.object).toBe("billing.updated");
	expect(data?.customer_id).toBe(customerId);
	expect(data?.tags).toEqual([]);

	if (entityId !== undefined) {
		if (entityId === null) {
			expect(data?.entity_id ?? undefined).toBeUndefined();
		} else {
			expect(data?.entity_id).toBe(entityId);
		}
	}

	if (!planChanges) return;
	expect(data?.plan_changes).toHaveLength(planChanges.length);

	for (const expectation of planChanges) {
		const change = findPlanChange(data?.plan_changes, expectation.planId);
		expect(
			change,
			`missing plan change for ${expectation.planId}`,
		).toBeDefined();
		expect(change?.action).toBe(expectation.action ?? "updated");

		const snapshot = {
			plan_id: expectation.planId,
			status: expectation.status ?? "active",
		};
		if ((expectation.kind ?? "subscription") === "subscription") {
			expect(change?.purchase).toBeUndefined();
			expect(change?.subscription).toMatchObject({
				...snapshot,
				past_due: false,
			});
		} else {
			expect(change?.subscription).toBeUndefined();
			expect(change?.purchase).toMatchObject(snapshot);
		}

		if (expectation.itemChanges) {
			const itemChanges = getWebhookItemChanges(change);
			expect(itemChanges).toHaveLength(expectation.itemChanges.length);
			expect(itemChanges).toEqual(
				expect.arrayContaining(
					expectation.itemChanges.map((itemChange) =>
						expect.objectContaining({
							action: itemChange.action,
							feature_id: itemChange.featureId,
							...(itemChange.included === undefined
								? {}
								: {
										item: expect.objectContaining({
											included: itemChange.included,
										}),
									}),
						}),
					),
				),
			);
		}
	}
};
