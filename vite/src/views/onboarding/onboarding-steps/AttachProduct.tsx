import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";
import { Product } from "@autumn/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

let attachCodeNextjs = (productId: string, apiKey: string) => {
  return `// app/page.tsx

  import { useAutumn } from 'autumn-js/react';

  const { attach } = useAutumn();

  <Button onClick={() => attach({ product_id: "${
    productId || "PRODUCT_ID"
  }" })}>
    Buy ${productId || "Product"}
  </Button>
`;
};

export default function AttachProduct({
  products,
  apiKey,
  number,
}: {
  products: Product[];
  apiKey: string;
  number: number;
}) {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products.length > 0 ? products[0].id! : "",
  );

  return (
    <Step
      title="Handle payments"
      number={number}
      description={
        <div className="flex flex-col gap-4">
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
          <div className="mb-4">
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
            >
              <SelectTrigger className="w-full max-w-48">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name || product.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
    >
      <CodeBlock
        snippets={[
          {
            title: "React",
            language: "javascript",
            displayLanguage: "javascript",
            content: attachCodeNextjs(selectedProductId, apiKey),
          },
        ]}
      />
    </Step>
  );
}
