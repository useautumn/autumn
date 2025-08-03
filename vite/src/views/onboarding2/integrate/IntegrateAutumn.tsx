import { AITools } from "./AITools";
import { SelectStack } from "./SelectStack";
import { useState } from "react";
import { IntegrateContext } from "./IntegrateContext";
import { notNullish } from "@/utils/genUtils";
import { Install } from "./integration-steps/Install";
import { AutumnHandler } from "./integration-steps/AutumnHandler";
import { parseAsString, parseAsJson, useQueryStates } from "nuqs";

export default function IntegrateAutumn() {
  const [stack, setStack] = useState<{
    frontend: string;
    backend: string;
    auth: string;
    customerType: string;
  }>({
    frontend: "",
    backend: "",
    auth: "",
    customerType: "",
  });

  const [queryStates, setQueryStates] = useQueryStates({
    frontend: parseAsString.withDefault(""),
    backend: parseAsString.withDefault(""),
    auth: parseAsString.withDefault(""),
    customerType: parseAsString.withDefault(""),
  });

  const stackSelected = Object.values(stack).every(notNullish);

  return (
    <IntegrateContext.Provider value={{ queryStates, setQueryStates }}>
      <div className="w-full h-full p-10 flex flex-col items-center justify-start">
        <div className="max-w-[700px] w-full flex flex-col gap-6">
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
            {stackSelected && (
              <>
                <Install />
                <AutumnHandler />
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
