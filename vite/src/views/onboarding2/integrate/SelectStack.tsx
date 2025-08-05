import { useState } from "react";
import { StepHeader } from "./StepHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIntegrateContext } from "./IntegrateContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building,
  CircleUserRound,
  Code,
  Fingerprint,
  Info,
  InfoIcon,
  ScanFace,
  User,
} from "lucide-react";
import { SelectFrameworks } from "./select-stack/SelectFrameworks";
import { InfoBox } from "./components/InfoBox";
import { Button } from "@/components/ui/button";

export const SelectStack = () => {
  const { queryStates, setQueryStates } = useIntegrateContext();

  console.log("queryStates", queryStates);

  const tabClassName = `rounded-xs h-8 data-[state=active]:bg-stone-100 data-[state=active]:text-t2 data-[state=active]:shadow-inner data-[state=active]:border`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <StepHeader number={2} title="Select your stack" />
        <p className="text-sm text-t2">
          Help us customize the integration guide for your specific tech stack.
          Click{" "}
          <span
            onClick={() => {
              setQueryStates({ ...queryStates, reactTypescript: false });
            }}
            className="underline cursor-pointer"
          >
            here
          </span>{" "}
          if you're not using a React + Typescript backend stack.
        </p>
      </div>
      {queryStates.reactTypescript ? (
        <SelectFrameworks />
      ) : (
        <>
          <InfoBox>
            <p className="text-t2 text-sm">
              This onboarding guide shows how to set up Autumn using our
              frontend components / hooks on React and server-side framework
              adaptors.
              <br />
              <br />
              In your case, you should integrate with Autumn's API directly on
              the backend. We have SDKs for Typescript and Python. Learn how to
              do so{" "}
              <a
                className="text-t2 font-medium underline"
                href="https://docs.useautumn.com/setup/backend"
                target="_blank"
              >
                here
              </a>
              .
            </p>
          </InfoBox>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => {
              setQueryStates({ ...queryStates, reactTypescript: true });
            }}
          >
            Learn how to integrate Autumn with React + Typescript
          </Button>
        </>
      )}
    </div>
  );
};
