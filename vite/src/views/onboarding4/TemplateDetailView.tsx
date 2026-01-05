import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";
import type { PricingTier, TemplateConfig } from "./templateConfigs";

interface TemplateDetailViewProps {
	template: TemplateConfig;
	onBack: () => void;
	onCopyPlans: () => void;
}

function PricingTierCard({ tier }: { tier: PricingTier }) {
	return (
		<div
			className={cn(
				"flex flex-col rounded-xl border bg-card p-5 h-full",
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
				{tier.interval && <span className="text-sm text-t3">/{tier.interval}</span>}
			</div>

			<div className="flex flex-col gap-2 mt-auto">
				{tier.features.map((feature) => (
					<div key={feature} className="flex items-start gap-2">
						<Check className="size-4 text-primary shrink-0 mt-0.5" />
						<span className="text-sm text-t2">{feature}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span className="px-2 py-0.5 text-xs font-medium rounded-full bg-interactive-secondary text-t2 border">
			{children}
		</span>
	);
}

export function TemplateDetailView({
	template,
	onBack,
	onCopyPlans,
}: TemplateDetailViewProps) {
	return (
		<div className="flex flex-col gap-6">
			{/* Back button */}
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1.5 text-sm text-t3 hover:text-foreground transition-colors w-fit -mb-2"
			>
				<ArrowLeft className="size-4" />
				<span>Back to templates</span>
			</button>

			{/* Header */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-3">
					<h2 className="text-xl font-semibold text-foreground">
						{template.name}
					</h2>
					<span className="text-sm text-t3">by {template.company}</span>
				</div>

				<div className="flex flex-wrap gap-2">
					{template.tags.map((tag) => (
						<Tag key={tag}>{tag}</Tag>
					))}
				</div>

				<p className="text-sm text-t2 leading-relaxed">{template.description}</p>
			</div>

			{/* Pricing tiers */}
			<div className="flex flex-col gap-3">
				<h3 className="text-sm font-medium text-foreground">Pricing Tiers</h3>
				<div className="grid grid-cols-3 gap-4">
					{template.pricingTiers.map((tier) => (
						<PricingTierCard key={tier.name} tier={tier} />
					))}
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-3 pt-2">
				<Button variant="primary" onClick={onCopyPlans}>
					Copy plans to Autumn
				</Button>
				<Button
					variant="secondary"
					onClick={() => window.open(template.websiteUrl, "_blank")}
				>
					<ExternalLink className="size-4" />
					View pricing page
				</Button>
			</div>
		</div>
	);
}

