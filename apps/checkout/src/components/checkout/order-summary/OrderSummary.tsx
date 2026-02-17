import type { PreviewLineItem } from "@autumn/shared";
import { motion } from "motion/react";
import { useMemo } from "react";
import { PlanGroupSection } from "@/components/checkout/plan/PlanGroupSection";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { LAYOUT_TRANSITION } from "@/lib/animations";

interface PlanGroup {
	planId: string;
	planName: string;
	items: PreviewLineItem[];
	type: "incoming" | "outgoing";
	cancelledAt?: number;
}

export function OrderSummary() {
	const { preview, incoming = [], outgoing = [], freeTrial, hasActiveTrial, total, currency } =
		useCheckoutContext();

	if (!preview) return null;

	const { line_items, next_cycle } = preview;

	// Build a map of next cycle line items by plan_id (for trial plans that have no immediate charges)
	const nextCycleItemsByPlan = useMemo(() => {
		if (!next_cycle?.line_items) return new Map<string, PreviewLineItem[]>();
		const map = new Map<string, PreviewLineItem[]>();
		for (const item of next_cycle.line_items) {
			if (!map.has(item.plan_id)) {
				map.set(item.plan_id, []);
			}
			map.get(item.plan_id)!.push(item);
		}
		return map;
	}, [next_cycle]);

	const hasNoImmediateCharges = line_items.length === 0 && total === 0;
	const showNextCycleBreakdown = hasNoImmediateCharges && next_cycle;

	// Use next cycle line items when showing next cycle breakdown, otherwise use immediate line items
	const displayLineItems: PreviewLineItem[] = showNextCycleBreakdown
		? next_cycle.line_items
		: line_items;

	// Build a map of plan_id -> plan_name from incoming and outgoing
	const planNameMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const change of [...outgoing, ...incoming]) {
			map.set(change.plan.id, change.plan.name || change.plan.id);
		}
		return map;
	}, [incoming, outgoing]);

	// Group line items by plan_id
	const planGroups = useMemo((): PlanGroup[] => {
		const groupMap = new Map<string, PreviewLineItem[]>();

		for (const item of displayLineItems) {
			const planId = item.plan_id;
			if (!groupMap.has(planId)) {
				groupMap.set(planId, []);
			}
			groupMap.get(planId)!.push(item);
		}

		// Convert to array, with outgoing plans first (credits), then incoming plans
		const outgoingIds = new Set(outgoing.map((c) => c.plan.id));
		const incomingIds = new Set(incoming.map((c) => c.plan.id));
		const groups: PlanGroup[] = [];

		// Add outgoing plan groups first (including those with no line items like free plans)
		for (const change of outgoing) {
			const planId = change.plan.id;
			const items = groupMap.get(planId) || [];
			groups.push({
				planId,
				planName: planNameMap.get(planId) || planId,
				items,
				type: "outgoing",
				cancelledAt: change.period_end,
			});
		}

		// Add incoming plan groups (including those with no line items)
		for (const change of incoming) {
			const planId = change.plan.id;
			const items = groupMap.get(planId) || [];
			groups.push({
				planId,
				planName: planNameMap.get(planId) || planId,
				items,
				type: "incoming",
			});
		}

		// Add any remaining line item groups that weren't in incoming/outgoing
		for (const [planId, items] of groupMap) {
			if (!outgoingIds.has(planId) && !incomingIds.has(planId)) {
				groups.push({
					planId,
					planName: planNameMap.get(planId) || planId,
					items,
					type: "incoming",
				});
			}
		}

		return groups;
	}, [displayLineItems, outgoing, incoming, planNameMap]);

	return (
		<motion.div
			layout
			className="flex flex-col gap-4"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<div className="flex flex-col gap-4">
				{planGroups.map((group) => {
					const isIncomingTrial = group.type === "incoming" && hasActiveTrial;
					return (
						<PlanGroupSection
							key={group.planId}
							planName={group.planName}
							items={group.items}
							currency={currency}
							type={group.type}
							cancelledAt={group.cancelledAt}
							hasActiveTrial={isIncomingTrial}
							freeTrial={group.type === "incoming" ? freeTrial : undefined}
							nextCycleItems={isIncomingTrial ? nextCycleItemsByPlan.get(group.planId) : undefined}
						/>
					);
				})}
			</div>
		</motion.div>
	);
}
