import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

let attachCodeNextjs = (productId: string, apiKey: string) => {
  return `// app/layout.tsx

  import { AutumnProvider } from "autumn-js/next";

  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode,
  }) {
    return (
      <html>
        <body>
        // Wrap your app with AutumnProvider
          <AutumnProvider
            customerId="YOUR_INTERNAL_CUSTOMER_ID"
            customerData={{ name: "John Doe" }}
          >
            {children}
          </AutumnProvider>
        </body>
      </html>
    );
  }

// app/page.tsx

  import { useAutumn } from 'autumn-js/next';

  const { attach } = useAutumn();

  <Button onClick={() => attach({ product_id: "${
    productId || "PRODUCT_ID"
  }" })}>
    Buy ${productId || "Product"}
  </Button>
`;
};

const attachCodeTypescript = (productId: string, apiKey: string) => {
  return `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  // Set your publishable key (using VITE as an example)
  publishableKey: import.meta.env.VITE_AUTUMN_PUBLISHABLE_KEY,
});

const checkoutUrl = await autumn.attach({ product_id: "${
    productId || "PRODUCT_ID"
  }" });

// Redirect the user to the checkout URL
window.location.href = checkoutUrl;
`;
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
          endpoint will return a Stripe Checkout URL. Once paid, the user will
          be granted access to the features you defined above.
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
            title: "Next.js",
            language: "javascript",
            displayLanguage: "javascript",
            content: attachCodeNextjs(productId, apiKey),
          },
          {
            title: "Typescript",
            language: "typescript",
            displayLanguage: "typescript",
            content: attachCodeTypescript(productId, apiKey),
          },
        ]}
      />
      {/* </div> */}
      {/* </div> */}
    </Step>
  );
}
