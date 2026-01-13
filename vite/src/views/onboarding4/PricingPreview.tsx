import { PreviewCreditSchemaCard } from "./preview/PreviewCreditSchemaCard";
import { PreviewPlanCard } from "./preview/PreviewPlanCard";
import { transformToPreviewProducts } from "./preview/previewTypes";
import type { AgentPricingConfig } from "./pricingAgentUtils";

interface PreviewOrg {
	apiKey: string;
	orgId: string;
	orgSlug: string;
}

interface PricingPreviewProps {
	config: AgentPricingConfig | null;
	previewOrg: PreviewOrg | null;
	isSyncing: boolean;
}

export function PricingPreview({
	config,
	previewOrg,
	isSyncing,
}: PricingPreviewProps) {
	const hasProducts = config && config.products.length > 0;

	const previewProducts = hasProducts
		? transformToPreviewProducts({
				products: config.products,
				features: config.features,
			})
		: [];

	// Find credit system features to display their schemas
	const creditSystemFeatures = hasProducts
		? config.features.filter(
				(f) =>
					f.type === "credit_system" &&
					f.credit_schema &&
					f.credit_schema.length > 0,
			)
		: [];

	return (
		<div className="flex-1 flex flex-col bg-secondary/30 rounded-xl overflow-hidden border border-border/50 shadow-sm">
			{/* Mac window header */}
			<div className="flex items-center gap-2 px-4 py-1 bg-background/60 border-b border-border/50">
				<div className="flex gap-2">
					<div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
					<div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
					<div className="w-3 h-3 rounded-full bg-[#27C93F]" />
				</div>
				<div className="flex-1 text-center">
					<span className="text-xs text-t3 font-medium">
						your-app.com/pricing
					</span>
				</div>
				{/* Spacer to balance the layout */}
				<div className="w-[52px]" />
			</div>

			{/* Content area with dotted grid background */}
			<div
				className={`flex-1 flex ${hasProducts ? "flex-col p-4 overflow-auto gap-4" : "items-center justify-center"}`}
				style={{
					backgroundImage:
						"radial-gradient(circle, rgba(128, 128, 128, 0.15) 1px, transparent 1px)",
					backgroundSize: "16px 16px",
				}}
			>
				{hasProducts ? (
					<>
						<div className="flex gap-3 flex-wrap justify-center">
							{previewProducts.map((product) => (
								<PreviewPlanCard
									key={product.id}
									product={product}
									previewApiKey={previewOrg?.apiKey}
									isSyncing={isSyncing}
								/>
							))}
						</div>

						{/* Credit system schema cards */}
						{creditSystemFeatures.length > 0 && (
							<div className="flex gap-3 flex-wrap justify-center">
								{creditSystemFeatures.map((creditFeature) => (
									<PreviewCreditSchemaCard
										key={creditFeature.id}
										creditFeature={creditFeature}
										allFeatures={config.features}
									/>
								))}
							</div>
						)}
					</>
				) : (
					<div className="text-center px-8">
						<p className="text-t3 text-sm">
							Your pricing tiers will appear here as you describe them
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
