import { StepBadge } from "@autumn/ui";

export const Default = () => (
	<div className="flex items-center gap-2">
		<StepBadge>1</StepBadge>
		<StepBadge>2</StepBadge>
		<StepBadge>3</StepBadge>
	</div>
);

export const OnboardingSteps = () => (
	<div className="flex flex-col gap-3">
		<div className="flex items-center gap-2.5">
			<StepBadge>1</StepBadge>
			<span className="text-md">Connect your Stripe account</span>
		</div>
		<div className="flex items-center gap-2.5">
			<StepBadge>2</StepBadge>
			<span className="text-md">Create your first product</span>
		</div>
		<div className="flex items-center gap-2.5">
			<StepBadge>3</StepBadge>
			<span className="text-md">Install the Autumn SDK</span>
		</div>
	</div>
);

export const WithDescription = () => (
	<div className="flex items-start gap-2.5">
		<StepBadge>2</StepBadge>
		<div className="flex flex-col gap-0.5">
			<span className="text-md font-medium">Define your features</span>
			<span className="text-muted-foreground text-sm">
				Add the metered features customers will be billed for.
			</span>
		</div>
	</div>
);
