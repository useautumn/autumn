import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

let attachCode = (productId: string, apiKey: string) => {
  return `const response = await fetch('https://api.useautumn.com/v1/attach', {
  method: "POST",
  headers: {
    Authorization: 'Bearer ${apiKey || "<AUTUMN_SECRET_KEY>"}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID 
    "product_id": "${
      productId || "<PRODUCT_ID>"
    }" // Set above in the 'Products' table
  })
})

const data = await response.json();
const checkoutUrl = data.checkout_url;

// Redirect the user to the checkout URL
window.location.href = checkoutUrl;`;
};

export default function AttachProduct({
  productId,
  apiKey,
  number,
}: {
  productId: string;
  apiKey: string;
  number: number;
}) {
  return (
    <Step
      title="Get a Stripe Checkout URL"
      number={number}
      description={
        <p>
          The{" "}
          <span className="font-mono text-red-500">
            <a
              href="https://docs.useautumn.com/api-reference/attach/post"
              target="_blank"
              rel="noopener noreferrer"
            >
              /attach
            </a>
            <ArrowUpRightFromSquare size={12} className="inline ml-1" />
          </span>{" "}
          endpoint will return a Stripe Checkout URL that your customers can use
          to purchase your product.
        </p>
      }
    >
      {/* <div className="flex gap-8 w-full justify-between flex-col lg:flex-row"> */}
      {/* <p>
            You can do this directly from your frontend using the Publishable
            API Key.
          </p> */}

      {/* <div className="w-full lg:w-2/3 min-w-md max-w-2xl"> */}
      <CodeBlock
        snippets={[
          {
            title: "JavaScript",
            language: "javascript",
            displayLanguage: "javascript",
            content: attachCode(productId, apiKey),
          },
        ]}
      />
      {/* </div> */}
      {/* </div> */}
    </Step>
  );
}
