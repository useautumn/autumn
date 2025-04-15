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
}: {
  productId: string;
  apiKey: string;
}) {
  return (
    <Step title="Attach a Product">
      <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
        <div className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
          <p>
            The <span className="font-mono text-red-500">/attach</span> endpoint
            will return a Stripe Checkout URL that you should redirect your user
            to, when they want to purchase one of the products above.
          </p>
          <p>
            You can do this directly from your frontend using the Publishable
            API Key.
          </p>
        </div>
        <div className="w-full lg:w-2/3 min-w-md max-w-2xl">
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
      </div>
    </Step>
  );
}
