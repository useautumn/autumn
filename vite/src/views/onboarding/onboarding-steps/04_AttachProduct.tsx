import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";

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
        <div className="flex flex-col gap-2 text-t2 max-w-md">
          <p>
            The <span className="font-mono text-red-500">/attach</span> endpoint
            will return a Stripe Checkout URL that your customers can use to
            purchase your product.
          </p>
        </div>
      }
    >
      {/* <div className="flex gap-8 lg:w-2/3 bg-blue-100 w-full justify-between flex-col"> */}
      <div className="w-full min-w-md max-w-xl">
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
      </div>
      {/* </div> */}
    </Step>
  );
}
