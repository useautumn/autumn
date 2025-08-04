import { AITools } from "./AITools";
import { SelectStack } from "./SelectStack";

import { IntegrateContext } from "./IntegrateContext";
import { notNullish } from "@/utils/genUtils";
import { Install } from "./integration-steps/Install";
import { AutumnHandler } from "./integration-steps/AutumnHandler";
import {
  parseAsString,
  parseAsJson,
  useQueryStates,
  parseAsBoolean,
} from "nuqs";
import { AddAutumnProvider } from "./integration-steps/AddAutumnProvider";
import { CheckoutPricingTable } from "./integration-steps/CheckoutPricingTable";
import { EnvStep } from "./integration-steps/EnvStep";

export default function IntegrateAutumn() {
  const [queryStates, setQueryStates] = useQueryStates({
    reactTypescript: parseAsBoolean.withDefault(true),
    frontend: parseAsString.withDefault(""),
    backend: parseAsString.withDefault(""),
    auth: parseAsString.withDefault(""),
    customerType: parseAsString.withDefault(""),
  });

  const stackSelected = Object.values(queryStates).every(notNullish);

  return (
    <IntegrateContext.Provider value={{ queryStates, setQueryStates }}>
      <div className="w-full h-full p-10 flex flex-col items-center justify-start">
        <div className="max-w-[600px] w-full flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xl">Integrate Autumn</p>
            <p className="text-t3">
              Let's integrate Autumn and get your first customer onto one of
              your plans
            </p>
          </div>

          <div className="flex flex-col gap-8 pb-40">
            <AITools />
            <SelectStack />
            {stackSelected && queryStates.reactTypescript && (
              <>
                <EnvStep />
                <Install />
                <AutumnHandler />
                <AddAutumnProvider />
                <CheckoutPricingTable />
              </>
            )}
          </div>

          {/* <div className="flex flex-col gap-4">
          <StepHeader number={2} title="Add your secret key" />
          <p className="text-md text-t3">
            Create a .env file in the root of your project and add the following
            environment variables:
          </p>
          <EnvStep />
        </div> */}
        </div>
      </div>
    </IntegrateContext.Provider>
  );
}
