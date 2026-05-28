import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
import { expect } from "bun:test";

/**
 * Returns the plan_id of a change regardless of whether it carries a
 * `subscription` or a `purchase` snapshot.
 */
export const getChangePlanId = (
	change: CustomerPlanChange,
): string | undefined =>
	change.subscription?.plan_id ?? change.purchase?.plan_id;

export const findPlanChange = (
	response: BillingChangeResponse,
	{ action, planId }: { action: PlanChangeAction; planId: string },
): CustomerPlanChange | undefined =>
	response.plan_changes.find(
		(change) => change.action === action && getChangePlanId(change) === planId,
	);

export const expectPlanChange = (
	change: CustomerPlanChange | undefined,
	{
		action,
		planId,
		previousAttributes,
		itemChanges,
	}: {
		action: PlanChangeAction;
		planId: string;
		previousAttributes?: Record<string, unknown> | null;
		itemChanges?: Array<{ action: "created" | "deleted"; feature_id: string }>;
	},
): CustomerPlanChange => {
	expect(change, `expected ${action} change for plan ${planId}`).toBeDefined();
	const resolved = change as CustomerPlanChange;
	expect(resolved.action).toBe(action);
	expect(getChangePlanId(resolved)).toBe(planId);

	if (previousAttributes === null) {
		expect(resolved.previous_attributes).toBeNull();
	} else if (previousAttributes !== undefined) {
		expect(resolved.previous_attributes).not.toBeNull();
		for (const [key, value] of Object.entries(previousAttributes)) {
			expect(
				resolved.previous_attributes,
				`previous_attributes.${key} mismatch`,
			).toMatchObject({ [key]: value });
		}
	}

	if (itemChanges !== undefined) {
		expect(resolved.item_changes).toEqual(
			expect.arrayContaining(
				itemChanges.map((itemChange) => expect.objectContaining(itemChange)),
			),
		);
	}

	return resolved;
};

export const expectBillingChangeResponse = (
	response: BillingChangeResponse,
	{
		customerId,
		activated = [],
		scheduled = [],
		updated = [],
		expired = [],
		tags,
	}: {
		customerId?: string;
		activated?: string[];
		scheduled?: string[];
		updated?: string[];
		expired?: string[];
		tags?: string[];
	},
): void => {
	if (customerId !== undefined) {
		expect(response.customer_id).toBe(customerId);
	}

	const byAction = (action: PlanChangeAction) =>
		response.plan_changes
			.filter((change) => change.action === action)
			.map((change) => getChangePlanId(change) ?? "")
			.sort();

	expect(byAction("activated")).toEqual([...activated].sort());
	expect(byAction("scheduled")).toEqual([...scheduled].sort());
	expect(byAction("updated")).toEqual([...updated].sort());
	expect(byAction("expired")).toEqual([...expired].sort());

	if (tags !== undefined) {
		expect(
			(response as BillingChangeResponse & { tags?: string[] }).tags,
		).toEqual(tags);
	}
};
