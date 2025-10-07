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
			<div className="h-screen overflow-y-auto">
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

					<ConnectStripeSection />

					<EnvSection />

					<InstallSection />

					<BackendSection />

					<FrontendSection />

					<PricingTableSection />

					<NextStepsSection />
				</div>
			</div>
		</IntegrationProvider>
	);
};
