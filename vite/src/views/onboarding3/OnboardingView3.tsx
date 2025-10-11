import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { OnboardingSteps } from "@/views/onboarding3/components/OnboardingSteps";
import { ProductContext } from "@/views/products/product/ProductContext";
import LoadingScreen from "../general/LoadingScreen";
import { SaveChangesBar } from "../products/plan/components/SaveChangesBar";
import ConnectStripeDialog from "./ConnectStripeDialog";
import { OnboardingStepRenderer } from "./components/OnboardingStepRenderer";
import { StepHeader } from "./components/StepHeaders";
import { useInitFeature } from "./hooks/useInitProductAndFeature";
import { useInitFeatureItem } from "./hooks/useInitFeatureItem";
import { useOnboarding3QueryState } from "./hooks/useOnboarding3QueryState";
import { useOnboardingLogic } from "./hooks/useOnboardingLogic";
import { useOnboardingProductSync } from "./hooks/useOnboardingProductSync";
import { OnboardingPreview } from "./OnboardingPreview";
import { OnboardingStep } from "./utils/onboardingUtils";

export default function OnboardingContent() {
	const [connectStripeOpen, setConnectStripeOpen] = useState(false);
	const navigate = useNavigate();
	const env = useEnv();

	// Get query data
	const { isLoading: productsLoading } = useProductsQuery();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Sync product store with products list (like useProductSync but for onboarding)
	useOnboardingProductSync();

	// Initialize feature data
	useInitFeature();

	// Initialize feature item for Step 3 (handles refresh scenario)
	useInitFeatureItem();

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
						<div className="fixed pt-4 pl-4 z-10">
							<Tooltip>
								<TooltipTrigger asChild>
									<IconButton
										variant="skeleton"
										size="sm"
										onClick={() => navigateTo("/products", navigate, env)}
										icon={<ArrowLeftIcon className="size-4" />}
									>
										Exit to Dashboard
									</IconButton>
								</TooltipTrigger>
								<TooltipContent className="ml-5">
									<span className="text-sm block whitespace-pre-line max-w-48">
										You can come back at any time by clicking in the top right
										corner&apos;s &quot;Onboarding&quot; button.
									</span>
								</TooltipContent>
							</Tooltip>
						</div>

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
						<div className="absolute top-4 left-4 z-10">
							<Tooltip>
								<TooltipTrigger asChild>
									<IconButton
										variant="skeleton"
										size="sm"
										onClick={() => navigateTo("/products", navigate, env)}
										icon={<ArrowLeftIcon className="size-4" />}
									>
										Exit to Dashboard
									</IconButton>
								</TooltipTrigger>
								<TooltipContent className="ml-5">
									<span className="text-sm block whitespace-pre-line max-w-48">
										You can come back at any time by clicking in the top right
										corner&apos;s &quot;Onboarding&quot; button.
									</span>
								</TooltipContent>
							</Tooltip>
						</div>

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
								<div className="bg-card border-base border overflow-x-hidden rounded-[12px] shadow-sm p-0 flex-1 overflow-y-auto">
									{/* Components access Zustand directly - no props! */}
									<OnboardingStepRenderer />
								</div>
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
