import { useState } from "react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductContext } from "@/views/products/product/ProductContext";
import LoadingScreen from "../general/LoadingScreen";
import { SaveChangesBar } from "../products/plan/components/SaveChangesBar";
import ConnectStripeDialog from "./ConnectStripeDialog";
import { ExitButton } from "./components/ExitButton";
import { OnboardingStepRenderer } from "./components/OnboardingStepRenderer";
import { OnboardingSteps } from "./components/OnboardingSteps";
import { StepHeader } from "./components/StepHeaders";
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
	useAutoSkipToPlayground();

	// Initialize onboarding logic and store handlers
	useOnboardingLogic();

	// Compute loading state
	const isQueryLoading = productsLoading || featuresLoading;

	if (isQueryLoading) {
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
				{step === OnboardingStep.Integration ? (
					// Full-width centered layout for Integration step
					// NOTE: This section kept with original layout as per user request
					<div className="relative w-full h-full bg-[#EEEEEE]">
						{/* Exit button - takes up space on left */}
						<ExitButton position="fixed" />

						{/* Top right: Step header and controls - takes up space on right */}
						<div className="fixed pt-4 pr-4 right-0 z-10 flex flex-col gap-2 items-end">
							<div className="bg-card border-base border rounded-[12px] shadow-sm p-4">
								{/* Components access Zustand directly - no props! */}
								<StepHeader />
							</div>
							<div className="bg-card border-base border rounded-[12px] shadow-sm p-4 w-full">
								{/* Components access Zustand directly - no props! */}
								<OnboardingSteps />
							</div>
						</div>

						{/* Main content - centered between islands */}
						<div className="w-full h-full flex justify-center overflow-y-auto py-4 pl-[200px] pr-[432px]">
							{/* Components access Zustand directly - no props! */}
							<OnboardingStepRenderer />
						</div>
					</div>
				) : (
					// Standard layout for other steps - NO PROP DRILLING!
					<div className="relative w-full h-full flex bg-[#EEEEEE]">
						{/* Exit button */}
						<ExitButton />

						<div className="w-4/5 flex items-center justify-center relative">
							{/* Components access Zustand directly - no props! */}
							<OnboardingPreview setConnectStripeOpen={setConnectStripeOpen} />

							{step === OnboardingStep.Playground && (
								<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
									<SaveChangesBar isOnboarding={true} />
								</div>
							)}
						</div>

						<div className="h-full flex flex-col p-3 min-w-lg max-w-lg">
							<div className="rounded-lg h-full flex flex-col p-1 gap-[0.625rem] overflow-x-hidden">
								<div className="bg-card border-base border overflow-x-hidden rounded-[12px] shadow-sm mt-1 p-4 shrink-0">
									{/* Components access Zustand directly - no props! */}
									<StepHeader />
								</div>
								<SheetContainer className="bg-card border-base border overflow-x-hidden rounded-[12px] shadow-sm p-0 flex-1 -mr-1">
									{/* Components access Zustand directly - no props! */}
									<OnboardingStepRenderer />
								</SheetContainer>
								<div className="bg-card border-base border rounded-[12px] shadow-sm flex flex-col p-4 shrink-0">
									<div className="flex items-center justify-center">
										{/* Components access Zustand directly - no props! */}
										<OnboardingSteps />
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
			</ProductContext.Provider>
		</>
	);
}
