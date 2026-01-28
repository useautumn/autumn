import { AlertTriangle, ArrowUpRightFromSquare, Code } from "lucide-react";
import Step from "@/components/general/OnboardingStep";
import { Button } from "@/components/ui/button";

interface IntegrationGuideStepProps {
	number: number;
	showIntegrationSteps: boolean;
	setShowIntegrationSteps: (show: boolean) => void;
}

export default function IntegrationGuideStep({
	number,
	showIntegrationSteps,
	setShowIntegrationSteps,
}: IntegrationGuideStepProps) {
	return (
		<Step
			title="Integrate Autumn"
			number={number}
			description={
				<>
					<span>
						When you're ready, follow the steps below to embed Autumn into your
						application.
					</span>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				{!showIntegrationSteps && (
					<Button
						onClick={() => setShowIntegrationSteps(true)}
						variant="outline"
					>
						<Code size={14} className="mr-2" />
						Show integration guide
					</Button>
				)}

				{showIntegrationSteps && (
					<div className="bg-zinc-50 border border-zinc-200 rounded-md p-4 shadow-sm">
						<div className="flex items-start">
							{/* <AlertTriangle className="h-5 w-5 text-t3 mr-3 flex-shrink-0" /> */}
							<div>
								<p className="text-sm text-t3">
									This guide is for React & Node.js. Read our{" "}
									<a
										href="https://docs.useautumn.com"
										target="_blank"
										rel="noopener noreferrer"
										className="text-yellow-800 underline font-medium"
									>
										docs
										<ArrowUpRightFromSquare size={12} className="inline ml-1" />
									</a>{" "}
									if your stack is different.
								</p>
							</div>
						</div>
					</div>
				)}
			</div>
		</Step>
	);
}
