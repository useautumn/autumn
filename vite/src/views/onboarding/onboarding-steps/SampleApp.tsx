import { Button } from "@/components/ui/button";
import Step from "@/components/general/OnboardingStep";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { useEnv } from "@/utils/envUtils";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";
import { ProductsContext } from "@/views/products/ProductsContext";
import { ProductsTable } from "@/views/products/ProductsTable";
import { Product, products, ProductV2 } from "@autumn/shared";
import {
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { AddProductButton } from "@/views/customers/customer/add-product/AddProductButton";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import CreateProduct from "@/views/products/CreateProduct";
import { useSearchParams } from "react-router";
import { PricingTable } from "@/components/autumn/pricing-table";
import { useAutumn, useCustomer } from "autumn-js/react";
import {
  Check,
  Lock,
  Send,
  ChevronDown,
  ChevronRight,
  Code,
  ArrowUpRightFromSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CodeBlock from "@/views/onboarding/components/CodeBlock";

export const SampleApp = ({
  data,
  number,
  mutate,
}: {
  data: any;
  number: number;
  mutate: () => Promise<void>;
}) => {
  const env = useEnv();

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [product, setProduct] = useState<any>(data.products[0]);
  const [features, setFeatures] = useState<any[]>(data.features);
  const [open, setOpen] = useState(false);
  const [checkData, setCheckData] = useState<any>(null);
  const [trackData, setTrackData] = useState<any>(null);
  const [showCodeSection, setShowCodeSection] = useState(false);
  const [showCheckSnippet, setShowCheckSnippet] = useState(true);
  const [showTrackSnippet, setShowTrackSnippet] = useState(true);
  const [showCustomerSnippet, setShowCustomerSnippet] = useState(true);
  const [showCustomerAPI, setShowCustomerAPI] = useState(false);
  const [lastUsedFeature, setLastUsedFeature] = useState<any>({
    featureId: data.features[0].id,
    value: 1,
  });

  if (!data.products) return null;

  const { customer } = useCustomer();
  const { openBillingPortal } = useAutumn();

  return (
    <Step
      title={"Explore your sample app"}
      number={number}
      description={
        <p>
          View the sample app that has been generated from your products and
          features.
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ArrowUpRightFromSquare size={12} className="mr-2" />
                Show Sample App
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-y-auto w-full h-full">
              <div>
                <DialogHeader className="flex flex-row items-center justify-between h-12">
                  <DialogTitle>Sample App</DialogTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCodeSection(!showCodeSection)}
                    className="self-start bg-zinc-800 text-white mr-7"
                  >
                    <Code size={16} className="mr-2" />
                    {showCodeSection ? "Hide Code" : "Show Code"}
                  </Button>
                </DialogHeader>
                <div className="w-full max-w-4xl">
                  <span className="text-sm text-t3">
                    Every time you use a feature, we{" "}
                    <span className="font-medium font-mono bg-zinc-200 rounded-xs px-1 text-t2">
                      check
                    </span>{" "}
                    for access permission, then{" "}
                    <span className="font-medium font-mono bg-zinc-200 rounded-xs px-1 text-t2">
                      track
                    </span>{" "}
                    the usage. Test using features, hitting usage limits,
                    upgrade and downgrade flows, and making changes to your
                    products.
                  </span>
                </div>
              </div>
              <div className="flex gap-6 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-md font-medium">
                        Available Features
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {data.features
                        ?.filter(
                          (feature: any) => customer?.features?.[feature.id],
                        )
                        .concat(
                          data.features?.filter(
                            (feature: any) => !customer?.features?.[feature.id],
                          ) || [],
                        )
                        .map((feature: any, index: number) => {
                          const customerFeature =
                            customer?.features?.[feature.id];
                          return (
                            <FeatureUsageItem
                              key={index}
                              feature={feature}
                              customerFeature={customerFeature}
                              onCheckData={setCheckData}
                              onTrackData={setTrackData}
                              onFeatureUsed={setLastUsedFeature}
                            />
                          );
                        })}
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-md font-medium">Billing</h3>
                      {customer?.stripe_id && (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            await openBillingPortal();
                          }}
                        >
                          Manage Billing
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <PricingTable />
                    </div>
                  </div>
                </div>

                {/* Code Snippets Toggle Button */}
                {showCodeSection && (
                  <div className="flex flex-col gap-3 animate-in slide-in-from-right-1/2 duration-300">
                    {/* Code Snippets */}
                    <div className="flex flex-col gap-3 w-full max-w-96 min-w-96 ">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-t2">
                              Check feature
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setShowCheckSnippet(!showCheckSnippet)
                              }
                              className="h-6 w-6 p-0"
                            >
                              {showCheckSnippet ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </Button>
                          </div>
                          {showCheckSnippet && (
                            <CodeBlock
                              snippets={[
                                {
                                  title: "React",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${
                                    checkData
                                      ? `import { useAutumn } from 'autumn-js/react';
import PaywallDialog from '@/components/...';

const { check } = useAutumn();

const handleCheckFeature = async () => {
  const { data } = await check({
    featureId: '${lastUsedFeature?.featureId || data.features?.[0]?.id || "feature-id"}',
    dialog: PaywallDialog
  });
};`
                                      : "// Click 'Send' on a feature to see a check request"
                                  }`,
                                },
                                {
                                  title: "Node.js",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${
                                    checkData
                                      ? `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const { data } = await autumn.check({
  customerId: 'user_123',
  featureId: '${lastUsedFeature?.featureId || data.features?.[0]?.id || "feature-id"}'
});
`
                                      : "// Click 'Send' on a feature to see a check request"
                                  }`,
                                },
                                {
                                  title: "Response",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${checkData ? JSON.stringify(checkData, null, 2) : "// Click 'Send' on a feature to see a check response"}`,
                                },
                              ]}
                            />
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-t2">Track usage</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setShowTrackSnippet(!showTrackSnippet)
                              }
                              className="h-6 w-6 p-0"
                            >
                              {showTrackSnippet ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </Button>
                          </div>
                          {showTrackSnippet && (
                            <CodeBlock
                              snippets={[
                                {
                                  title: "React",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${
                                    trackData
                                      ? `import { useAutumn } from 'autumn-js/react';

const { track } = useAutumn();

const handleTrackUsage = async () => {
  await track({
    featureId: '${lastUsedFeature?.featureId || data.features?.[0]?.id || "feature-id"}',
    value: ${lastUsedFeature?.value || 1}
  });
};`
                                      : "// Click 'Send' on a feature to see a track request"
                                  }`,
                                },
                                {
                                  title: "Node.js",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${
                                    trackData
                                      ? `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const response = await autumn.track({
  featureId: '${lastUsedFeature?.featureId || data.features?.[0]?.id || "feature-id"}',
  value: ${lastUsedFeature?.value || 1}
});
`
                                      : "// Click 'Send' on a feature to see a track request"
                                  }`,
                                },
                                {
                                  title: "Response",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${trackData ? JSON.stringify(trackData, null, 2) : "// Click 'Send' on a feature to see a track response"}`,
                                },
                              ]}
                            />
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-t2">
                              Customer data
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setShowCustomerSnippet(!showCustomerSnippet)
                              }
                              className="h-6 w-6 p-0"
                            >
                              {showCustomerSnippet ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </Button>
                          </div>
                          {showCustomerSnippet && (
                            <CodeBlock
                              snippets={[
                                {
                                  title: "React",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `import { useCustomer } from 'autumn-js/react';

const { customer, refetch } = useCustomer();

console.log('Customer:', customer);

const handleTrackUsage = async () => {
  //refresh customer data after feature is used 
  await refetch();
};`,
                                },
                                {
                                  title: "Node.js",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const { customer } = await autumn.customers.get('user_123');`,
                                },
                                {
                                  title: "Response",
                                  language: "typescript",
                                  displayLanguage: "typescript",
                                  content: `${customer ? JSON.stringify(customer, null, 2) : "// Customer data will appear here after using features"}`,
                                },
                              ]}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Step>
  );
};

const FeatureUsageItem = ({
  feature,
  customerFeature,
  onCheckData,
  onTrackData,
  onFeatureUsed,
}: {
  feature: any;
  customerFeature: any;
  onCheckData: (data: any) => void;
  onTrackData: (data: any) => void;
  onFeatureUsed: (feature: any) => void;
}) => {
  const { check, track } = useAutumn();
  const { customer, refetch } = useCustomer();
  const [trackValue, setTrackValue] = useState<number | string>(1);

  if (feature.type === "boolean") {
    return (
      <div className="flex flex-col w-48 h-16 bg-stone-100 px-2 py-1.5 border rounded-xs">
        <div
          className={cn(
            " text-xs uppercase rounded-md flex items-center gap-2 truncate",
            !customerFeature ? "text-t3" : "text-t2",
          )}
        >
          {feature.name || `Feature ${feature.id || "Unknown"}`}
          {customerFeature ? (
            <Check size={10} className="text-green-500" />
          ) : (
            <Lock size={10} className="text-gray-400" />
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col w-48 h-16 bg-stone-100 px-2 py-1.5 border rounded-xs justify-between">
      <div className="flex items-center gap-2 mb-2 justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs truncate uppercase",
              customerFeature ? "text-t2" : "text-t3",
            )}
          >
            {feature.name || `Feature ${feature.id || "Unknown"}`}
          </span>
          {!customerFeature && <Lock size={10} className="text-gray-400" />}
        </div>
      </div>
      <div className="flex items-center gap-2 text-t2 justify-between">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={customerFeature ? trackValue : ""}
            onChange={(e) => setTrackValue(e.target.value)}
            className="w-12 h-6 px-1 text-xs bg-white border rounded-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            disabled={!customerFeature}
          />
          <Button
            variant="secondary"
            disabled={!customerFeature}
            className="h-6 px-2"
            onClick={async () => {
              onFeatureUsed({
                featureId: customerFeature.id,
                value: Number(trackValue),
              });
              let { data: checkResponse } = await check({
                featureId: customerFeature.id,
              });
              onCheckData(checkResponse);

              if (checkResponse?.allowed) {
                toast.success(`Used ${trackValue} ${feature.name}`);
                const { data: trackResponse } = await track({
                  featureId: customerFeature.id,
                  value: Number(trackValue),
                });
                onTrackData(trackResponse);
                await refetch();
              }
            }}
          >
            <Send size={10} />
          </Button>
        </div>
        {customerFeature && (
          <span className="text-sm text-t2">
            {customerFeature.unlimited
              ? "unlimited"
              : `${customerFeature.usage}${customerFeature.included_usage > 0 && ` / ${customerFeature.included_usage}`}`}
          </span>
        )}
      </div>
    </div>
  );
};
