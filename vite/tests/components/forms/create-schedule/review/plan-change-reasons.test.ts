import { expect, test } from "bun:test";
import type { CustomerPlanChange, Feature } from "@autumn/shared";
import { planChangeLines } from "@/components/forms/create-schedule/utils/review/planChangeLines";

const JUL_31_2027 = Date.UTC(2027, 6, 31);
const NOW = Date.UTC(2026, 8, 30);

const change = (overrides: Partial<CustomerPlanChange>): CustomerPlanChange =>
	({
		entity_id: null,
		action: "updated",
		subscription: {
			plan_id: "enterprise",
			expires_at: null,
			trial_ends_at: null,
			canceled_at: null,
			past_due: false,
		},
		previous_attributes: null,
		item_changes: [],
		...overrides,
	}) as CustomerPlanChange;

const features = [{ id: "sso", name: "SSO" }] as Feature[];

test("a plan whose end date was dropped says it no longer ends", () => {
	expect(
		planChangeLines({
			change: change({ previous_attributes: { expires_at: JUL_31_2027 } }),
			features,
		}),
	).toEqual([{ state: "updated", text: "No longer ends Jul 31, 2027" }]);
});

test("lifecycle and content changes each get a line, with added features marked new", () => {
	expect(
		planChangeLines({
			change: change({
				previous_attributes: { past_due: true, canceled_at: NOW },
				plan_change: {
					price_change: {},
					item_changes: [
						{ action: "created", feature_id: "sso" },
						{ action: "deleted", feature_id: "audit_logs" },
					],
				} as unknown as CustomerPlanChange["plan_change"],
			}),
			features,
		}),
	).toEqual([
		{ state: "updated", text: "Cancellation removed" },
		{ state: "updated", text: "No longer past due" },
		{ state: "updated", text: "Price changed" },
		{ state: "new", text: "SSO added" },
		{ state: "removed", text: "audit_logs removed" },
	]);
});
