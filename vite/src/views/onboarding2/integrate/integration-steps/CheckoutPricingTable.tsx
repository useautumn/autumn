import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { CodeSpan } from "../components/CodeSpan";
import { StepHeader } from "../StepHeader";
import { Frontend } from "../StackEnums";
import { useIntegrateContext } from "../IntegrateContext";
import { InfoBox } from "../components/InfoBox";

const nextjsSnippet = () => {
  return `import { PricingTable } from "autumn-js/react";

export default function Home() {
  return (
    <div className="h-screen w-screen flex justify-center items-center p-10">
      <div className="w-full max-w-[800px]">
        <PricingTable />
      </div>
    </div>
  );
}`;
};

const getSnippet = (queryStates: any) => {
  return nextjsSnippet();
};

export const CheckoutPricingTable = () => {
  const { queryStates } = useIntegrateContext();
  return (
    <div className="flex flex-col gap-4 w-full">
      <StepHeader
        number={7}
        title={
          <p>
            Drop in <CodeSpan>{"<PricingTable />"}</CodeSpan>
          </p>
        }
      />
      <p className="text-t2 text-sm">
        Display a pricing table with the plans you have created and let your
        customers choose a plan.
      </p>
      <CodeBlock
        snippets={[
          {
            title: "React App",
            language: "javascript",
            displayLanguage: "javascript",
            content: getSnippet(queryStates),
          },
        ]}
      />
      <InfoBox classNames={{ infoIcon: "!pt-1.5" }}>
        <p className="text-t2 text-sm leading-5">
          {
            "Our <PricingTable /> component is completely customisable by installing it as a shadcn component. "
          }
          Learn how to do so{" "}
          <a
            className="text-t2 font-medium underline"
            href="https://docs.useautumn.com/setup/shadcn"
            target="_blank"
          >
            here
          </a>
          .
        </p>
      </InfoBox>
    </div>
  );
};
