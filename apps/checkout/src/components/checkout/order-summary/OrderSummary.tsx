import { type PreviewLineItem } from "@autumn/shared";
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
	const {
		preview,
		incoming = [],
		outgoing = [],
		freeTrial,
		hasActiveTrial,
		total,
		currency,
	} = useCheckoutContext();

	if (!preview) return null;

	const { line_items, next_cycle } = preview;

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

	const displayLineItems: PreviewLineItem[] = showNextCycleBreakdown
		? next_cycle.line_items
		: line_items;

	const planNameMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const change of [...outgoing, ...incoming]) {
			map.set(
				change.plan_id,
				change.plan?.name || change.plan_id,
			);
		}
		return map;
	}, [incoming, outgoing]);

	

	const planGroups = useMemo((): PlanGroup[] => {
		const groupMap = new Map<string, PreviewLineItem[]>();

		for (const item of displayLineItems) {
			const planId = item.plan_id;
			if (!groupMap.has(planId)) {
				groupMap.set(planId, []);
			}
			groupMap.get(planId)!.push(item);
		}

		const outgoingByPlanId = new Map(
			outgoing.map((change) => [change.plan_id, change]),
		);
		const scheduledCancelIds = new Set<string>();

		for (const change of incoming) {
			const outgoingChange = outgoingByPlanId.get(change.plan_id);

			if (
				outgoingChange &&
				outgoingChange.canceled_at == null &&
				change.canceled_at != null
			) {
				scheduledCancelIds.add(change.plan_id);
			}
		}

		const visibleIncoming = incoming.filter(
			(change) => !scheduledCancelIds.has(change.plan_id),
		);
		const visibleIncomingIds = new Set(
			visibleIncoming.map((change) => change.plan_id),
		);
		const visibleOutgoing = outgoing.filter(
			(change) => !visibleIncomingIds.has(change.plan_id),
		);
		const outgoingIds = new Set<string>(visibleOutgoing.map((c) => c.plan_id));
		const groups: PlanGroup[] = [];

		for (const change of visibleOutgoing) {
			const planId = change.plan_id;
			const items = groupMap.get(planId) || [];
			groups.push({
				planId,
				planName: planNameMap.get(planId) || planId,
				items,
				type: "outgoing",
				cancelledAt: change.effective_at ?? undefined,
			});
		}

		for (const change of visibleIncoming) {
			const planId = change.plan_id;
			const items = groupMap.get(planId) || [];
			groups.push({
				planId,
				planName: planNameMap.get(planId) || planId,
				items,
				type: "incoming",
			});
		}

		for (const [planId, items] of groupMap) {
			if (!outgoingIds.has(planId) && !visibleIncomingIds.has(planId)) {
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
							nextCycleItems={
								isIncomingTrial
									? nextCycleItemsByPlan.get(group.planId)
									: undefined
							}
						/>
					);
				})}
			</div>
		</motion.div>
	);
}
