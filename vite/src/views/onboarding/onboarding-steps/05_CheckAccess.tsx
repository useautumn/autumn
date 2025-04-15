import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";

import CodeBlock from "../components/CodeBlock";

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
      title="Check if user has access to a feature and send usage events"
      number={number}
      description={
        <p className="text-t2 flex flex-col gap-2 w-full max-w-md">
          <span>
            If you have a feature with access restrictions, check whether a user
            can access it by calling the{" "}
            <span className="font-mono text-red-500">/entitled</span> endpoint.
          </span>
          <span>
            If it&apos;s a usage-based feature, send us the usage data by
            calling the <span className="font-mono text-red-500">/events</span>{" "}
            endpoint.
            {/* You must use your{" "}
            <span className="font-bold">Secret API Key</span> for this. */}
          </span>
        </p>
      }
    >
      <div className="flex gap-8 w-full justify-between flex-col">
        <div className="w-full min-w-md max-w-xl flex flex-col gap-2">
          {/* <h2 className="text-t2 font-medium text-md">Check Feature Access</h2> */}
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
      </div>
    </Step>
  );
}
