import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";

import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

const checkAccessCode = (apiKey: string) => `// app/page.tsx

import { useAutumn } from "autumn-js/next";

const { check } = useAutumn();
// replace with any feature ID you created in the product above
let { allowed } = await check({ featureId: "messages" });

if (allowed) {
// let user access "messages" feature
} else {
    alert("You have no more messages");
  } 
}
`;

const checkAccessCodeTypescript = (
  apiKey: string
) => `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  publishableKey: import.meta.env.VITE_AUTUMN_PUBLISHABLE_KEY,
});

let { data, error } = await autumn.check({ feature_id: "messages" });

if (data?.allowed) {
// let user access "messages" feature
} else {
    alert("You have no more messages");
  } 
}
`;

const usageEventCode = (apiKey: string) => `// app/page.tsx

import { useAutumn } from "autumn-js/next";

const { track } = useAutumn();

await track({ featureId: "messages" });
`;

const usageEventCodeTypescript = (apiKey: string) => `// server.ts

import { Autumn } from "autumn-js";

let autumn = new Autumn({
//use secret key to track usage
  secretKey: "am_sk_test_...", 
});

await autumn.track({ featureId: "messages" });
`;

export default function CheckAccessStep({
  apiKey,
  number,
}: {
  apiKey: string;
  number: number;
}) {
  return (
    <Step
      title="Check if customer can access a feature, and send usage events"
      number={number}
      description={
        <>
          <span>
            Check whether a customer can access a feature by calling the{" "}
            <span className="font-mono text-red-500">
              <a
                href="https://docs.useautumn.com/api-reference/entitled"
                target="_blank"
                rel="noopener noreferrer"
              >
                /check
              </a>
              <ArrowUpRightFromSquare size={12} className="inline ml-1" />
            </span>{" "}
            endpoint.
          </span>
          <span>
            If it&apos;s a usage-based feature, send us the usage data by
            calling the{" "}
            <span className="font-mono text-red-500">
              <a
                href="https://docs.useautumn.com/api-reference/events/post"
                target="_blank"
                rel="noopener noreferrer"
              >
                /track
              </a>
              <ArrowUpRightFromSquare size={12} className="inline ml-1" />
            </span>{" "}
            endpoint.
          </span>
        </>
      }
    >
      {/* <h2 className="text-t2 font-medium text-md">Check Feature Access</h2> */}
      <div className="flex flex-col gap-2">
        <CodeBlock
          snippets={[
            {
              title: "Next.js",
              language: "javascript",
              displayLanguage: "javascript",
              content: checkAccessCode(apiKey),
            },
            {
              title: "TypeScript",
              language: "typescript",
              displayLanguage: "typescript",
              content: checkAccessCodeTypescript(apiKey),
            },
          ]}
        />
        {/* <h2 className="text-t2 font-medium text-md mt-4">
              Send Usage Events
            </h2> */}
        <CodeBlock
          snippets={[
            {
              title: "Next.js",
              language: "javascript",
              displayLanguage: "javascript",
              content: usageEventCode(apiKey),
            },
            {
              title: "Typescript",
              language: "typescript",
              displayLanguage: "typescript",
              content: usageEventCodeTypescript(apiKey),
            },
          ]}
        />
      </div>
    </Step>
  );
}
