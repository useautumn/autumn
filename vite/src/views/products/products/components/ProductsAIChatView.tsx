import { useMemo } from "react";
import { CompactPromptInput } from "@/components/ai-elements/CompactPromptInput";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { PricingChatPanel } from "@/views/onboarding4/components/PricingChatPanel";
import { usePricingAgentChat } from "@/views/onboarding4/hooks/usePricingAgentChat";
import { PricingConfigSheet } from "@/views/onboarding4/PricingConfigSheet";
import { PricingPreview } from "@/views/onboarding4/PricingPreview";
import { convertToAgentConfig } from "@/views/onboarding4/utils/convertToAgentConfig";
import { usePricingConfigSave } from "../hooks/usePricingConfigSave";
import { ConfirmBatchVersionDialog } from "./ConfirmBatchVersionDialog";

/**
 * AI chat view for the products page.
 * Similar to the onboarding AIChatView but starts with existing plans loaded.
 */
export function ProductsAIChatView() {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	// Filter out archived products
	const activeProducts = useMemo(
		() => products.filter((p) => !p.archived),
		[products],
	);

	// Convert existing products/features to initial config
	const initialConfig = useMemo(() => {
		if (activeProducts.length === 0 && features.length === 0) {
			return null;
		}
		return convertToAgentConfig({ products: activeProducts, features });
	}, [activeProducts, features]);

	const {
		messages,
		input,
		setInput,
		isLoading,
		pricingConfig,
		previewOrg,
		isPreviewSyncing,
		jsonSheetConfig,
		setJsonSheetConfig,
		handleSubmit,
		handleStartNewChat,
	} = usePricingAgentChat({ initialConfig });

	const {
		isSaving,
		confirmOpen,
		setConfirmOpen,
		versionedProductIds,
		handleSave,
		handleConfirmSave,
	} = usePricingConfigSave({ initialConfig });

	// Track if chat has started (has any messages)
	const chatStarted = messages.length > 0;

	// Use the AI-generated config if available, otherwise fall back to initial
	const displayConfig = pricingConfig ?? initialConfig;

	return (
		<div className="w-full h-[calc(100vh-200px)] flex flex-col">
			<div className="flex-1 flex min-h-0 relative">
				{/* Left: Chat - width animates from 0 */}
				<div
					className="flex flex-col overflow-hidden transition-all duration-300 ease-out"
					style={{ width: chatStarted ? "33.333%" : "0%" }}
				>
					{chatStarted && (
						<PricingChatPanel
							messages={messages}
							input={input}
							onInputChange={setInput}
							onSubmit={handleSubmit}
							isLoading={isLoading}
							onViewJson={setJsonSheetConfig}
							placeholder="Describe changes to your pricing..."
							className="flex-1"
							inputClassName="px-0 pb-0 mr-4"
						/>
					)}
				</div>

				{/* Right: Pricing Preview - shrinks as chat expands */}
				<div className="flex-1 flex flex-col transition-all duration-300 ease-out">
					<PricingPreview
						config={displayConfig}
						initialConfig={initialConfig}
						previewOrg={previewOrg}
						isSyncing={isPreviewSyncing}
						headerActions={
							displayConfig &&
							displayConfig.products.length > 0 &&
							chatStarted && (
								<>
									<Button
										variant="secondary"
										size="sm"
										onClick={handleStartNewChat}
									>
										Reset
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => handleSave({ config: displayConfig })}
										isLoading={isSaving}
									>
										Save changes
									</Button>
								</>
							)
						}
					/>

					{/* Floating input when chat hasn't started */}
					{!chatStarted && (
						<div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none">
							<div className="pointer-events-auto w-full max-w-md">
								<CompactPromptInput
									value={input}
									onChange={setInput}
									onSubmit={() => handleSubmit({ text: input, files: [] })}
									placeholder="Describe changes to your pricing..."
									isLoading={isLoading}
								/>
							</div>
						</div>
					)}
				</div>
			</div>

			<PricingConfigSheet
				open={jsonSheetConfig !== null}
				onOpenChange={(open) => !open && setJsonSheetConfig(null)}
				config={jsonSheetConfig}
			/>
			<ConfirmBatchVersionDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				productIds={versionedProductIds}
				onConfirm={handleConfirmSave}
			/>
		</div>
	);
}
