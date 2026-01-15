import { useMemo, useState } from "react";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { getSnippet, type Snippet } from "@/lib/snippets";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface AttachStepProps {
	snippet: Snippet;
	stepNumber: number;
}

export function AttachStep({ snippet: _, stepNumber }: AttachStepProps) {
	const [attachMode, setAttachMode] = useState<"pricing-table" | "custom">(
		"pricing-table",
	);

	// Get snippets based on mode
	const pricingTableSnippet = useMemo(
		() =>
			getSnippet({
				id: "attach-pricing-table",
				sdk: "react",
			}),
		[],
	);

	const billingStateSnippet = useMemo(
		() =>
			getSnippet({
				id: "billing-state",
				sdk: "react",
			}),
		[],
	);

	const checkoutSnippet = useMemo(
		() =>
			getSnippet({
				id: "checkout",
				sdk: "react",
			}),
		[],
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Mode selector above steps */}
			<GroupedTabButton
				value={attachMode}
				className="mb-4"
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

			{attachMode === "pricing-table" ? (
				/* Single step for PricingTable */
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2.5">
						<StepBadge>{stepNumber}</StepBadge>
						<span className="font-medium text-sm">
							{pricingTableSnippet.title}
						</span>
					</div>
					<p className="text-sm text-t2 pl-[34px]">
						{pricingTableSnippet.description}
					</p>
					<div className="pl-[34px]">
						<SnippetCodeBlock snippet={pricingTableSnippet} />
					</div>
				</div>
			) : (
				/* Two steps for Build your own */
				<>
					{/* Step 1: Billing State */}
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2.5">
							<StepBadge>{stepNumber}</StepBadge>
							<span className="font-medium text-sm">
								{billingStateSnippet.title}
							</span>
						</div>
						<p className="text-sm text-t2 pl-[34px]">
							{billingStateSnippet.description}
						</p>
						<div className="pl-[34px]">
							<SnippetCodeBlock snippet={billingStateSnippet} />
						</div>
					</div>

					{/* Step 2: Checkout */}
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2.5">
							<StepBadge>{stepNumber + 1}</StepBadge>
							<span className="font-medium text-sm">
								{checkoutSnippet.title}
							</span>
						</div>
						<p className="text-sm text-t2 pl-[34px]">
							{checkoutSnippet.description}
						</p>
						<div className="pl-[34px]">
							<SnippetCodeBlock snippet={checkoutSnippet} />
						</div>
					</div>
				</>
			)}
		</div>
	);
}
