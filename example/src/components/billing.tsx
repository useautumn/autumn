"use client";

import { attachProduct } from "@/app/autumn-functions";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function CustomerDetailsExample({
  customerData,
}: {
  customerData: any;
}) {
  const { customer, entitlements, products } = customerData;
  
  const getEntitlement = (featureId: string) => {
    return entitlements.find(
      (entitlement: any) => entitlement.feature_id === featureId
    );
  };

  const upgradeClicked = async () => {
    try {
      const res = await attachProduct({
        customerId: customer.id,
        productId: "pro",
      });
      window.open(res.checkout_url, "_blank");
    } catch (error: any) {
      toast.error(`${error}`);
    }
  };

  const buyExtraCreditsClicked = async () => {
    try {
      const res = await attachProduct({
        customerId: customer.id,
        productId: "extra-credits",
      });
      window.open(res.checkout_url, "_blank");
    } catch (error: any) {
      toast.error(`${error}`);
    }
  };

  const messageCredits = getEntitlement("message-credits");
  const premiumCredits = getEntitlement("premium-credits");
  const hasPro = products.length > 0 && products[0].id === "pro";

  return (
    <div className="border rounded-lg bg-white overflow-hidden flex flex-col">
      <div className="border-b p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Customer Details</h2>
            <p className="text-sm text-muted-foreground">
              Current subscription and feature access
            </p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-stone-50 flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-stone-600" />
          </div>
        </div>
      </div>

      <div className="p-6 flex-1">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Customer ID</span>
            <span className="text-sm font-mono bg-stone-50 px-2 py-1 rounded">
              {customer.id}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Standard Messages Remaining</span>
            <span className="text-sm font-mono bg-stone-50 px-2 py-1 rounded">
              {messageCredits?.balance || 0}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Premium Messages Remaining</span>
            <span className="text-sm font-mono bg-stone-50 px-2 py-1 rounded">
              {premiumCredits?.balance || 0}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Current Plan</span>
            <span className="text-sm font-medium">
              {hasPro ? (
                <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                  Pro
                </span>
              ) : (
                <span className="bg-stone-50 text-stone-600 px-2 py-1 rounded-full">
                  Free
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 p-6 pt-0">
      <div className="w-full pt-0">
        {!hasPro && (
          <button
            className="w-full"
            onClick={upgradeClicked}
          >
            Upgrade to Pro
          </button>
        )}
      </div>
      <div className="w-full pt-0">
          <button
            className="w-full"
            onClick={buyExtraCreditsClicked}
          >
            Buy Extra Premium Credits
          </button>
      </div>
      </div>
    </div>
  );
}
