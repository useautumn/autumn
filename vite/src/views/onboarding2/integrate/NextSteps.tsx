import { Button } from "@/components/ui/button";
import { StepHeader } from "./StepHeader";
import { SampleApp } from "../SampleApp";
import { useIntegrateContext } from "./IntegrateContext";

export const NextSteps = () => {
  const { data, mutate } = useIntegrateContext();
  return (
    <>
      <div className="flex flex-col gap-4 w-full">
        <StepHeader number={2} title={<p>Next Steps</p>} />
        <p className="text-t2 text-sm">
          Congrats on setting up Autumn! The next steps are to learn how to use
          Autumn to check if a user has access to features in your application,
          and track usage for those features. Learn how to do so{" "}
          <a
            href="https://docs.useautumn.com/features/check"
            className="underline cursor-pointer"
          >
            here
          </a>
          .
        </p>

        <SampleApp data={data} />
      </div>
    </>
  );
};
