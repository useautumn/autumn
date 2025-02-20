import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import React from "react";

function CustomerBalances({ customer }: { customer: any }) {
  if (!customer) {
    return <div></div>;
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {customer.entitlements.map((entitlement) => (
        <div
          key={entitlement.feature_id}
          className="flex flex-col justify-between w-36 gap-3 border border-zinc-200 bg-white p-4 rounded-md shadow-sm bg-gradient-to-b from-white to-zinc-100"
        >
          {/* <div> */}
          <p className="text-sm font-medium text-gray-600">
            {keyToTitle(entitlement.feature_id)}
          </p>
          <p className="text-lg font-bold text-t2/90">
            {entitlement.unlimited === true
              ? "Unlimited"
              : entitlement.balance !== undefined
              ? `${entitlement.balance} / ${
                  entitlement.balance + entitlement.used
                }`
              : "✅"}
          </p>
        </div>
      ))}
    </div>
  );
}

export default CustomerBalances;
