import { type ProductV2, UsageModel } from "@autumn/shared";
import { useMemo, useState } from "react";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { PlanSelector } from "@/components/v2/PlanSelector";
import { getSnippet, type Snippet } from "@/lib/snippets";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface AttachStepProps {
	snippet: Snippet;
	stepNumber: number;
	productId?: string;
	products?: ProductV2[];
}

/**
 * Checks if a product has any prepaid feature items.
 */
function hasPrepaidFeature({ product }: { product: ProductV2 }): boolean {
	return (
		product.items?.some((item) => item.usage_model === UsageModel.Prepaid) ??
		false
	);
}

/**
 * Gets the first prepaid feature ID from a product.
 */
function getFirstPrepaidFeatureId({
	product,
}: {
	product: ProductV2;
}): string | undefined {
	const prepaidItem = product.items?.find(
		(item) => item.usage_model === UsageModel.Prepaid,
	);
	return prepaidItem?.feature_id ?? undefined;
}

export function AttachStep({
	snippet: _,
	stepNumber,
	productId,
	products = [],
}: AttachStepProps) {
	const [attachMode, setAttachMode] = useState<"pricing-table" | "custom">(
		"pricing-table",
	);
	const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
		productId ?? null,
	);

	// Filter to non-archived, non-add-on plans with prices
	const availablePlans = useMemo(() => {
		return products.filter(
			(p) =>
				!p.archived &&
				!p.is_add_on &&
				p.items?.some(
					(item) => item.price != null || (item.tiers && item.tiers.length > 0),
				),
		);
	}, [products]);

	const selectedPlan = availablePlans.find((p) => p.id === selectedPlanId);
	const isPrepaid = selectedPlan
		? hasPrepaidFeature({ product: selectedPlan })
		: false;
	const prepaidFeatureId = selectedPlan
		? getFirstPrepaidFeatureId({ product: selectedPlan })
		: undefined;

	// Get the appropriate snippet based on mode and prepaid status
	const displaySnippet = useMemo(() => {
		if (attachMode === "pricing-table") {
			return getSnippet({
				id: "attach-pricing-table",
				sdk: "react",
				dynamicParams: selectedPlanId
					? { productId: selectedPlanId }
					: undefined,
			});
		}

		// For custom mode, use prepaid snippet if has prepaid features
		const snippetId = isPrepaid ? "attach-custom-prepaid" : "attach-custom";

		return getSnippet({
			id: snippetId,
			sdk: "react",
			dynamicParams: {
				productId: selectedPlanId ?? undefined,
				prepaidFeatureId,
			},
		});
	}, [attachMode, selectedPlanId, isPrepaid, prepaidFeatureId]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{displaySnippet.title}</span>
			</div>

			<div className="pl-[34px]">
				<GroupedTabButton
					value={attachMode}
					onValueChange={(val) =>
						setAttachMode(val as "pricing-table" | "custom")
					}
					options={[
						{
							value: "pricing-table",
							label: "Use <PricingTable />",
						},
						{
							value: "custom",
							label: "Build your own",
						},
					]}
				/>
			</div>

			{attachMode === "custom" && availablePlans.length > 0 && (
				<div className="pl-[34px] flex items-center gap-2">
					<span className="text-sm text-t3">Plan:</span>
					<PlanSelector
						plans={availablePlans}
						selectedPlanId={selectedPlanId}
						onPlanChange={setSelectedPlanId}
					/>
				</div>
			)}

			<p className="text-sm text-t2 pl-[34px]">{displaySnippet.description}</p>

			{attachMode === "custom" && isPrepaid && (
				<div className="pl-[34px]">
					<InfoBox variant="info">
						This plan has a prepaid price, so you should pass in how much is
						being purchased using the options field.
					</InfoBox>
				</div>
			)}

			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={displaySnippet} />
			</div>
		</div>
	);
}
