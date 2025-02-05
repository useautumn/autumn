import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useDemoSWR } from "@/services/useAxiosSwr";
import React from "react";

function CustomerBalances({ customer }: { customer: any }) {
  if (!customer) {
    return <div>Loading...</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {customer.entitlements.map((entitlement) => (
        <div
          key={entitlement.feature_id}
          className="flex flex-col justify-between h-24 border border-zinc-200 bg-white p-4 rounded-md shadow-sm bg-gradient-to-b from-white to-zinc-100"
        >
          {/* <div> */}
          <p className="text-sm font-medium text-gray-600">
            {keyToTitle(entitlement.feature_id)}
          </p>
          <p className="text-lg font-bold text-t2/90">
            {`${entitlement.balance} / ${
              entitlement.balance + entitlement.used
            }` || "Allowed"}
          </p>
        </div>
      ))}
    </div>
  );
}

export default CustomerBalances;
