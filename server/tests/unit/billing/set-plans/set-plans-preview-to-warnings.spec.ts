import { describe, expect, test } from "bun:test";
import type {
	FullCusProduct,
	ProcessorItemChange,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import { setPlansPreviewToWarnings } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPreviewToWarnings";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

const itemChange = (
	overrides: Partial<ProcessorItemChange>,
): ProcessorItemChange => ({
	action: "created",
	item_id: null,
	price_id: "price_1",
	plan_id: "pro",
	feature_id: null,
	display_name: "pro",
	quantity: 1,
	previous_attributes: null,
	creates_price: false,
	managed_by_autumn: true,
	...overrides,
});

const phase = (
	overrides: Partial<SetPlansPreviewPhase>,
): SetPlansPreviewPhase => ({
	starts_at: 0,
	plan_changes: [],
	balance_changes: [],
	processor_item_changes: [],
	...overrides,
});

describe("setPlansPreviewToWarnings", () => {
	test("returns no warnings for a clean preview", () => {
		expect(
			setPlansPreviewToWarnings({
				phases: [
					phase({
						processor_item_changes: [
							itemChange({}),
							itemChange({ action: "deleted", item_id: "si_base" }),
						],
					}),
				],
				processorChanges: [
					{
						type: "subscription",
						processor: "stripe",
						id: null,
						action: "created",
					},
				],
				deletedCustomerProducts: [],
				outgoingCustomerProducts: [],
			}),
		).toEqual([]);
	});

	test("derives every warning type from the preview", () => {
		const scheduledEnterprise = makeFullCusProduct({ planId: "enterprise" });
		const outgoingPro: FullCusProduct = {
			...makeFullCusProduct({ planId: "pro" }),
			options: [
				{ feature_id: "seats", quantity: 5, upcoming_quantity: 3 },
			] as FullCusProduct["options"],
		};

		const warnings = setPlansPreviewToWarnings({
			phases: [
				phase({
					balance_changes: [
						{
							feature_id: "messages",
							balance: {
								granted: 500,
								remaining: 500,
								usage: 0,
								unlimited: false,
								next_reset_at: null,
							},
							previous_attributes: { usage: 40, granted: 100 },
						},
					],
					processor_item_changes: [
						itemChange({
							action: "deleted",
							display_name: "Support add-on",
							managed_by_autumn: false,
							plan_id: null,
						}),
						itemChange({ display_name: "premium", creates_price: true }),
					],
				}),
			],
			processorChanges: [
				{
					type: "subscription_schedule",
					processor: "stripe",
					id: "sub_sched_old",
					action: "released",
				},
			],
			deletedCustomerProducts: [scheduledEnterprise],
			outgoingCustomerProducts: [outgoingPro],
			requestedProrationBehavior: "none",
		});

		expect(warnings.map((warning) => warning.type)).toEqual([
			"unmanaged_stripe_item_removed",
			"new_stripe_price_created",
			"usage_reset",
			"existing_schedule_replaced",
			"future_phase_removed",
			"pending_quantity_change_dropped",
			"proration_disabled",
		]);
		expect(warnings[0].message).toContain("Support add-on");
		expect(warnings[4].message).toContain("enterprise");
	});
});
