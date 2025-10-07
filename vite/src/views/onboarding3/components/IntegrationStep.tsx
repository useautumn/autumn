import { Separator } from "@/components/v2/separator";
import { BackendSection } from "./integration-step/BackendSection";
import { ConnectStripeSection } from "./integration-step/ConnectStripeSection";
import { EnvSection } from "./integration-step/EnvSection";
import { FrontendSection } from "./integration-step/FrontendSection";
import { InstallSection } from "./integration-step/InstallSection";
import { IntegrationProvider } from "./integration-step/IntegrationContext";
import { MCPSection } from "./integration-step/MCPSection";
import { NextStepsSection } from "./integration-step/NextStepsSection";
import { PricingTableSection } from "./integration-step/PricingTableSection";
import { StackSelectionSection } from "./integration-step/StackSelectionSection";

export const IntegrationStep = () => {
	return (
		<IntegrationProvider>
			<div className="h-screen min-w-full overflow-y-auto overflow-x-hidden">
				<div className="flex flex-col gap-8 p-4">
					<div className="text-left">
						<h1 className="text-main-bold">Integrate Autumn</h1>
						<h3 className="text-body">
							Let's integrate Autumn and get your first customer onto one of
							your plans
						</h3>
					</div>
					<MCPSection />
					<StackSelectionSection />
					<Separator className="ml-[32px]" />
					<ConnectStripeSection />
					<Separator className="ml-[32px]" />
					<EnvSection />
					<Separator className="ml-[32px]" />
					<InstallSection />
					<Separator className="ml-[32px]" />
					<BackendSection />
					<Separator className="ml-[32px]" />
					<FrontendSection />
					<Separator className="ml-[32px]" />
					<PricingTableSection />
					<Separator className="ml-[32px]" />
					<NextStepsSection />
				</div>
			</div>
		</IntegrationProvider>
	);
};
