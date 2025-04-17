"use client";

import { getOrCreateCustomer } from "./autumn-functions";
import { useState } from "react";
import { useEffect } from "react";
import Intro from "@/components/introduction";
import CustomerDetailsExample from "@/components/billing";
import Application from "@/components/application";

// Replace this with your internal user ID
const CUSTOMER_ID = "theo";

export default function Home() {
  const [customerData, setCustomerData] = useState<any>(null);

  const fetchCustomer = async () => {
    const customer = await getOrCreateCustomer(CUSTOMER_ID);
    setCustomerData(customer);
  };

  useEffect(() => {
    fetchCustomer();
  }, []);

  if (!customerData) {
    return <></>;
  }

  return (
    <div className="min-h-screen w-full p-6 flex flex-col gap-8 max-w-7xl mx-auto">
      <Intro />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Application
          customerId={CUSTOMER_ID}
          fetchCustomer={fetchCustomer}
        />
        <CustomerDetailsExample customerData={customerData} />
      </div>
    </div>
  );
}
