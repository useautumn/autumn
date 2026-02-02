import type { AgentPricingConfig } from "@autumn/shared";
import type { ReactNode } from "react";
import { GroupedPlanCards } from "./preview/GroupedPlanCards";
import { PreviewCreditSchemaCard } from "./preview/PreviewCreditSchemaCard";
import {
	getChangedFeatureIds,
	getChangedProductIds,
	transformToPreviewProducts,
} from "./preview/previewTypes";

interface PreviewOrg {
	apiKey: string;
	orgId: string;
	orgSlug: string;
}

interface PricingPreviewProps {
	config: AgentPricingConfig | null;
	initialConfig?: AgentPricingConfig | null;
	previewOrg: PreviewOrg | null;
	isSyncing: boolean;
	headerActions?: ReactNode;
}

export function PricingPreview({
	config,
	initialConfig,
	previewOrg,
	isSyncing,
	headerActions,
}: PricingPreviewProps) {
	const hasProducts = config && config.products.length > 0;

	const previewProducts = hasProducts
		? transformToPreviewProducts({
				products: config.products,
				features: config.features,
			})
		: [];

	// Compute which products have changed from initial config
	const changedProductIds = getChangedProductIds({
		initialConfig: initialConfig ?? null,
		currentConfig: config,
	});

	// Compute which features have changed from initial config
	const changedFeatureIds = getChangedFeatureIds({
		initialConfig: initialConfig ?? null,
		currentConfig: config,
	});

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
			<div className="relative flex items-center justify-between px-4 py-2 bg-background border-b border-border/50 h-10">
				<div className="flex gap-2">
					<div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
					<div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
					<div className="w-3 h-3 rounded-full bg-[#27C93F]" />
				</div>
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<span className="text-xs text-t3 font-medium">
						your-app.com/pricing
					</span>
				</div>
				{headerActions && (
					<div className="flex items-center gap-2 animate-in fade-in duration-300">
						{headerActions}
					</div>
				)}
			</div>

			{/* Content area with dotted grid background */}
			<div
				className="flex-1 flex flex-col p-4 overflow-auto bg-card [--dot-color:rgba(0,0,0,0.15)] dark:[--dot-color:rgba(255,255,255,0.12)]"
				style={{
					backgroundImage:
						"radial-gradient(circle, var(--dot-color) 1px, transparent 1px)",
					backgroundSize: "16px 16px",
				}}
			>
				{hasProducts && (
					<div className="flex flex-col gap-6 my-auto">
						<GroupedPlanCards
							products={previewProducts}
							previewApiKey={previewOrg?.apiKey}
							isSyncing={isSyncing}
							changedProductIds={changedProductIds}
						/>

						{/* Credit system schema cards */}
						{creditSystemFeatures.length > 0 && (
							<div className="flex gap-3 flex-wrap justify-center">
								{creditSystemFeatures.map((creditFeature) => (
									<PreviewCreditSchemaCard
										key={creditFeature.id}
										creditFeature={creditFeature}
										allFeatures={config.features}
										isChanged={changedFeatureIds.has(creditFeature.id)}
									/>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
