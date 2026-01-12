import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PricingTier } from "./templateConfigs";

interface PricingCardProps {
	tier: PricingTier;
}

function PricingCard({ tier }: PricingCardProps) {
	return (
		<div
			className={cn(
				"flex flex-col rounded-xl border bg-card p-5 min-w-[220px] max-w-[280px]",
				tier.highlighted && "ring-2 ring-primary border-primary",
			)}
		>
			<div className="flex flex-col gap-1 mb-4">
				<span className="text-sm font-medium text-foreground">{tier.name}</span>
				{tier.description && (
					<span className="text-xs text-t3">{tier.description}</span>
				)}
			</div>

			<div className="flex items-baseline gap-1 mb-4">
				<span className="text-2xl font-semibold text-foreground">
					{tier.price}
				</span>
				{tier.interval && (
					<span className="text-sm text-t3">/{tier.interval}</span>
				)}
			</div>

			<div className="flex flex-col gap-2 mt-auto">
				{tier.features.map((feature) => (
					<div key={feature} className="flex items-start gap-2">
						<Check className="size-4 text-primary shrink-0 mt-0.5" />
						<span className="text-xs text-t2">{feature}</span>
					</div>
				))}
			</div>
		</div>
	);
}

interface PricingPreviewProps {
	tiers: PricingTier[];
}

export function PricingPreview({ tiers }: PricingPreviewProps) {
	if (tiers.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center bg-secondary/30 rounded-xl border border-dashed">
				<div className="text-center px-8">
					<p className="text-t3 text-sm">
						Your pricing tiers will appear here as you describe them
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex items-center justify-center bg-secondary/30 rounded-xl p-6 overflow-auto">
			<div className="flex gap-4 flex-wrap justify-center">
				{tiers.map((tier) => (
					<PricingCard key={tier.name} tier={tier} />
				))}
			</div>
		</div>
	);
}


