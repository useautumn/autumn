import type {
	BillingPreviewResponse,
	CheckoutChange,
	PreviewLineItem,
} from "@autumn/shared";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { AnimatedLayout } from "@/components/motion/animated-layout";
import { PlanGroupCard } from "@/components/checkout/PlanGroupCard";
import { STANDARD_TRANSITION, listContainerVariants } from "@/lib/animations";

interface PlanGroup {
	planId: string;
	planName: string;
	items: PreviewLineItem[];
	type: "incoming" | "outgoing";
}

interface OrderSummaryProps {
	planName: string;
	preview: BillingPreviewResponse;
	incoming?: CheckoutChange[];
	outgoing?: CheckoutChange[];
}

export function OrderSummary({
	planName,
	preview,
	incoming = [],
	outgoing = [],
}: OrderSummaryProps) {
	const { line_items, total, currency, next_cycle } = preview;

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
		<AnimatedLayout
			className="flex flex-col gap-4"
			layoutId="order-summary"
			variants={listContainerVariants}
			initial="initial"
			animate="animate"
		>
			{/* Plan groups as cards */}
			<div className="flex flex-col gap-3">
				<AnimatePresence mode="popLayout">
					{planGroups.map((group, groupIndex) => (
						<PlanGroupCard
							key={group.planId}
							planName={group.planName}
							items={group.items}
							currency={currency}
							index={groupIndex}
							type={group.type}
						/>
					))}
				</AnimatePresence>
			</div>

			{/* Message explaining changes take effect next cycle */}
			{showNextCycleBreakdown && (
				<motion.p
					className="text-xs text-muted-foreground"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ ...STANDARD_TRANSITION, delay: 0.2 }}
				>
					Changes take effect{" "}
					{format(new Date(next_cycle.starts_at), "d MMM yyyy")}
				</motion.p>
			)}
		</AnimatedLayout>
	);
}
