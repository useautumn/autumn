import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";

import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

const envCode = `AUTUMN_SECRET_KEY=am_sk_1234567890`;

export default function EnvStep({ number }: { number: number }) {
  return (
    <Step
      title="Add your secret key"
      number={number}
      description={
        <>
          <span>Add the Autumn secret key to your .env file.</span>
        </>
      }
    >
      {/* <h2 className="text-t2 font-medium text-md">Check Feature Access</h2> */}
      <div className="flex flex-col gap-2">
        <CodeBlock
          snippets={[
            {
              title: ".env",
              language: "bash",
              displayLanguage: "bash",
              content: envCode,
            },
          ]}
        />
      </div>
    </Step>
  );
}
