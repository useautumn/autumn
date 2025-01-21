"use client";

import { AppEnv, Customer } from "@autumn/shared";
import React from "react";
import CreateCustomer from "./CreateCustomer";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { CustomersContext } from "./CustomersContext";
import Link from "next/link";
import { CustomToaster } from "@/components/general/CustomToaster";
import { CustomersTable } from "./CustomersTable";

function CustomersView({ env }: { env: AppEnv }) {
  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: `/customers`,
    env,
  });

  if (isLoading) return <LoadingScreen />;

  const { customers } = data;
  // console.log(data);
  // console.log(customers);

  return (
    <CustomersContext.Provider value={{ customers, env, mutate }}>
      <CustomToaster />
      <h1 className="text-xl font-medium">Customers</h1>
      {customers?.length > 0 ? (
        <CustomersTable customers={customers} />
      ) : (
        <div className=" flex flex-col text-center text-t3">
          <span>You don&apos;t have any customers</span>
          <span className="text-t3 text-sm">...yet</span>
        </div>
      )}
      <CreateCustomer />
    </CustomersContext.Provider>
  );
}

export default CustomersView;
