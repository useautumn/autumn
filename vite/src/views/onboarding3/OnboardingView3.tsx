import { useEffect, useState } from "react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { trackSignUp } from "@/utils/posthogTracking";
import { ProductContext } from "@/views/products/product/ProductContext";
import LoadingScreen from "../general/LoadingScreen";
import { SaveChangesBar } from "../products/plan/components/SaveChangesBar";
import ConnectStripeDialog from "./ConnectStripeDialog";
import { ExitButton } from "./components/ExitButton";
import { IntegrationStep } from "./components/IntegrationStep";
import { OnboardingStepRenderer } from "./components/OnboardingStepRenderer";
import { OnboardingSteps } from "./components/OnboardingSteps";
import { StepHeader } from "./components/StepHeaders";
import { useAutoSetProductId } from "./hooks/useAutoSetProductId";
import { useAutoSkipToPlayground } from "./hooks/useAutoSkipToPlayground";
import { useInitFeatureItem } from "./hooks/useInitFeatureItem";
import { useOnboarding3QueryState } from "./hooks/useOnboarding3QueryState";
import { useOnboardingFeatureSync } from "./hooks/useOnboardingFeatureSync";
import { useOnboardingLogic } from "./hooks/useOnboardingLogic";
import { useOnboardingProductSync } from "./hooks/useOnboardingProductSync";
import { OnboardingPreview } from "./OnboardingPreview";
import { OnboardingStep } from "./utils/onboardingUtils";

export default function OnboardingContent() {
	const [connectStripeOpen, setConnectStripeOpen] = useState(false);

	// Get query data
	const { isLoading: productsLoading } = useProductsQuery();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Sync product store with products list (like useProductSync but for onboarding)
	// This handles all initialization logic
	useOnboardingProductSync();

	// Initialize feature data
	useOnboardingFeatureSync();

	// Initialize feature item for Step 3 (handles refresh scenario)
	useInitFeatureItem();

	// Auto-skip to playground if steps 1-3 are already complete
	const { isChecking: isCheckingAutoSkip } = useAutoSkipToPlayground();

	// Auto-set product_id in query params when entering playground step
	useAutoSetProductId();

	// Initialize onboarding logic and store handlers
	useOnboardingLogic();

	// Track sign-up event on first mount
	useEffect(() => {
		trackSignUp();
	}, []);

	// Compute loading state
	const isQueryLoading = productsLoading || featuresLoading;

	if (isQueryLoading || isCheckingAutoSkip) {
		return <LoadingScreen />;
	}

	return (
		<>
			<ConnectStripeDialog
				open={connectStripeOpen}
				setOpen={setConnectStripeOpen}
			/>
			<ProductContext.Provider
				value={{
					setShowNewVersionDialog: () => {},
					refetch: async () => {}, // Not needed in onboarding
				}}
			>
				{/* Standard layout for all steps - NO PROP DRILLING! */}
				<div
					className={cn(
						"relative w-full h-full flex bg-gray-medium [scrollbar-gutter:stable]",
						step === OnboardingStep.Integration
							? "overflow-y-auto"
							: "overflow-y-hidden",
					)}
				>
					{/* Exit button */}
					<ExitButton />

					<div className="w-4/5 flex items-center justify-center relative ">
						{/* Components access Zustand directly - no props! */}
						{step === OnboardingStep.Integration ? (
							<div className="w-full h-full flex items-start justify-center py-8 pl-10">
								<div className="max-w-3xl w-full">
									<IntegrationStep />
								</div>
							</div>
						) : (
							<>
								<OnboardingPreview
									setConnectStripeOpen={setConnectStripeOpen}
								/>

								{step === OnboardingStep.Playground && (
									<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
										<SaveChangesBar isOnboarding={true} />
									</div>
								)}
							</>
						)}
					</div>

					<div
						className={cn(
							"h-full flex flex-col p-3 min-w-lg max-w-lg pr-1",
							step === OnboardingStep.Integration && "sticky top-0",
						)}
					>
						<div className="rounded-lg h-full flex flex-col p-1 gap-[0.625rem] overflow-x-hidden">
							<div className="bg-card border-base border overflow-x-hidden rounded-[12px] mt-1 p-4 shrink-0">
								<StepHeader />
							</div>
							{step !== OnboardingStep.Integration && (
								<SheetContainer className="bg-card border-base border overflow-x-hidden rounded-[12px] p-0 flex-1 pr-0">
									<OnboardingStepRenderer />
								</SheetContainer>
							)}
							<div className="bg-card border-base border rounded-[12px] flex flex-col p-4 shrink-0">
								<div className="flex items-center justify-center">
									<OnboardingSteps />
								</div>
							</div>
						</div>
					</div>
				</div>
			</ProductContext.Provider>
		</>
	);
}
