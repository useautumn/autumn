import type { FrontendProduct } from "@autumn/shared";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { navigateTo } from "@/utils/genUtils";
import { OnboardingSteps } from "@/views/onboarding3/components/OnboardingSteps";
import { ProductContext } from "@/views/products/product/ProductContext";
import { SaveChangesBar } from "../products/plan/components/SaveChangesBar";
import ConnectStripeDialog from "./ConnectStripeDialog";
import { OnboardingStepRenderer } from "./components/OnboardingStepRenderer";
import { StepHeader } from "./components/StepHeaders";
import { useOnboardingLogic } from "./hooks/useOnboardingLogic";
import { OnboardingPreview } from "./OnboardingPreview";
import { getStepNumber, OnboardingStep } from "./utils/onboardingUtils";

export default function OnboardingContent() {
	const [connectStripeOpen, setConnectStripeOpen] = useState(false);
	const {
		// Data
		product,
		setProduct,
		diff,
		baseProduct,
		feature,
		setFeature,
		step,
		products,
		selectedProductId,

		// UI State
		sheet,
		setSheet,
		editingState,
		setEditingState,
		playgroundMode,
		setPlaygroundMode,

		// Handlers
		handleNext,
		handleBack,
		handlePlanSelect,
		onCreatePlanSuccess,
		handleRefetch,

		// Utils
		validateStep,
		navigate,
		env,
	} = useOnboardingLogic();

	return (
		<>
			<ConnectStripeDialog
				open={connectStripeOpen}
				setOpen={setConnectStripeOpen}
			/>
			<ProductContext.Provider
				value={{
					setShowNewVersionDialog: () => {},
					product,
					setProduct,
					entityFeatureIds: [],
					setEntityFeatureIds: () => {},
					diff,
					sheet,
					setSheet,
					editingState,
					setEditingState,
					refetch: handleRefetch,
				}}
			>
				{step === OnboardingStep.Integration ? (
					// Full-width centered layout for Integration step
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
								<StepHeader
									step={step}
									selectedProductId={selectedProductId}
									products={products}
									onPlanSelect={handlePlanSelect}
									onCreatePlanSuccess={onCreatePlanSuccess}
									playgroundMode={playgroundMode}
									setPlaygroundMode={setPlaygroundMode}
								/>
							</div>
							<div className="bg-card border-base border rounded-[12px] shadow-sm p-4 w-full">
								<OnboardingSteps
									totalSteps={5}
									currentStep={getStepNumber(step)}
									nextText={
										step === OnboardingStep.Integration ? "Finish" : "Next"
									}
									onNext={handleNext}
									onBack={handleBack}
									backDisabled={false}
									nextDisabled={!validateStep(step, product, feature)}
								/>
							</div>
						</div>

						{/* Main content - centered between islands */}
						<div className="w-full h-full flex items-center justify-center overflow-y-auto py-4 pl-[200px] pr-[432px]">
							<OnboardingStepRenderer
								step={step}
								feature={feature}
								setFeature={setFeature}
								playgroundMode={playgroundMode}
							/>
						</div>
					</div>
				) : (
					// Standard layout for other steps
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
							<OnboardingPreview
								currentStep={getStepNumber(step)}
								playgroundMode={playgroundMode}
								setConnectStripeOpen={setConnectStripeOpen}
							/>

							{step === OnboardingStep.Playground && (
								<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
									<SaveChangesBar
										isOnboarding={true}
										originalProduct={baseProduct as unknown as FrontendProduct}
										setOriginalProduct={() => {}} // Controlled by useOnboardingLogic
									/>
								</div>
							)}
						</div>

						<div className="max-w-[35%] h-full flex flex-col p-3">
							<div className="rounded-lg h-full flex flex-col p-1 gap-[0.625rem] overflow-x-hidden">
								<div className="bg-card border-base border overflow-x-hidden rounded-[12px] shadow-sm mt-1 p-4 shrink-0">
									<StepHeader
										step={step}
										selectedProductId={selectedProductId}
										products={products}
										onPlanSelect={handlePlanSelect}
										onCreatePlanSuccess={onCreatePlanSuccess}
										playgroundMode={playgroundMode}
										setPlaygroundMode={setPlaygroundMode}
									/>
								</div>
								<div className="bg-card border-base border overflow-x-hidden rounded-[12px] shadow-sm p-0 flex-1 overflow-y-auto">
									<OnboardingStepRenderer
										step={step}
										feature={feature}
										setFeature={setFeature}
										playgroundMode={playgroundMode}
									/>
								</div>
								<div className="bg-card border-base border rounded-[12px] shadow-sm flex flex-col p-4 shrink-0">
									<div className="flex items-center justify-center">
										<OnboardingSteps
											totalSteps={5}
											currentStep={getStepNumber(step)}
											nextText={getStepNumber(step) === 5 ? "Finish" : "Next"}
											onNext={handleNext}
											onBack={handleBack}
											backDisabled={getStepNumber(step) === 1}
											nextDisabled={!validateStep(step, product, feature)}
										/>
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
