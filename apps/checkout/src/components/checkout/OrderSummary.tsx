import type {
	ApiFreeTrialV2,
	BillingPreviewResponse,
	CheckoutChange,
	PreviewLineItem,
} from "@autumn/shared";
import { motion } from "motion/react";
import { useMemo } from "react";
import { CardBackground } from "@/components/checkout/CardBackground";
import { FreeTrialSection } from "@/components/checkout/FreeTrialSection";
import { PlanGroupSection } from "@/components/checkout/PlanGroupSection";
import { Separator } from "@/components/ui/separator";
import { LAYOUT_TRANSITION } from "@/lib/animations";

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
	freeTrial?: ApiFreeTrialV2;
	trialAvailable?: boolean;
}

export function OrderSummary({
	planName,
	preview,
	incoming = [],
	outgoing = [],
	freeTrial,
	trialAvailable = false,
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

	const showFreeTrial = freeTrial && trialAvailable;

	return (
		<motion.div
			layout
			className="flex flex-col gap-4 min-w-0"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			{/* Unified card containing all sections */}
			<motion.div
				layout
				layoutId="order-summary-card"
				transition={{ layout: LAYOUT_TRANSITION }}
				className="rounded-lg border border-border overflow-hidden"
			>
				<CardBackground>
					{planGroups.map((group, groupIndex) => (
						<div key={group.planId}>
							{/* Separator between sections */}
							{groupIndex > 0 && <Separator />}
							<PlanGroupSection
								planId={group.planId}
								planName={group.planName}
								items={group.items}
								currency={currency}
								type={group.type}
							/>
						</div>
					))}

					{/* Free trial section */}
					{showFreeTrial && (
						<>
							<Separator />
							<FreeTrialSection
								freeTrial={freeTrial}
								trialAvailable={trialAvailable}
							/>
						</>
					)}
				</CardBackground>
			</motion.div>


		</motion.div>
	);
}
