import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";

import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

const checkAccessCode = (
  apiKey: string
) => `const response = await fetch('https://api.useautumn.com/v1/entitled', {
  method: "POST",
  headers: {
    Authorization: 'Bearer ${apiKey || "<SECRET_API_KEY>"}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID
    "feature_id": "chat-messages" //Set above in the 'Features' table
  })
})`;

const usageEventCode = (
  apiKey: string
) => `await fetch('https://api.useautumn.com/v1/events', {
  method: "POST",
  headers: {
    Authorization: 'Bearer ${apiKey || "<SECRET_API_KEY>"}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID
    "event_name": "chat-message" //Set above in the 'Features' table
  })
})`;

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
                /entitled
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
                /events
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
              title: "JavaScript",
              language: "javascript",
              displayLanguage: "javascript",
              content: checkAccessCode(apiKey),
            },
          ]}
        />
        {/* <h2 className="text-t2 font-medium text-md mt-4">
              Send Usage Events
            </h2> */}
        <CodeBlock
          snippets={[
            {
              title: "JavaScript",
              language: "javascript",
              displayLanguage: "javascript",
              content: usageEventCode(apiKey),
            },
          ]}
        />
      </div>
    </Step>
  );
}
