import { useState } from "react";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { getSnippet, type Snippet } from "@/lib/snippets";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface AttachStepProps {
	snippet: Snippet;
	stepNumber: number;
	productId?: string;
}

export function AttachStep({
	snippet: _,
	stepNumber,
	productId,
}: AttachStepProps) {
	const [attachMode, setAttachMode] = useState<"pricing-table" | "custom">(
		"pricing-table",
	);

	const displaySnippet = getSnippet({
		id:
			attachMode === "pricing-table" ? "attach-pricing-table" : "attach-custom",
		sdk: "react",
		dynamicParams: productId ? { productId } : undefined,
	});

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

			<p className="text-sm text-t2 pl-[34px]">{displaySnippet.description}</p>

			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={displaySnippet} />
			</div>
		</div>
	);
}
