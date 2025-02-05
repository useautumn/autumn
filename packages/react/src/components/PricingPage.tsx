"use client";
import React, { useState, useEffect } from "react";
import { useCustomSwr } from "../hooks/useCustomSwr";
import { PricingPageProps } from "./models";
import { PricingCard } from "./PricingCard";
import { PricingPageContext } from "./PricingPageContext";
import { API_URL } from "../constants";

const makeImportant = (className?: string) => {
  if (!className) return "";
  return className
    .split(" ")
    .map((cls) => `!${cls}`)
    .join(" ");
};

const styles = {
  container: {
    display: "flex",
    height: "fit-content",

    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    gap: "2rem",
    // backgroundColor: "#666",

    justifyContent: "center",
    width: "100%",

    // display: "flex",
    // gap: "16px",
    // flexGrow: 1,
    // flexShrink: 0,
    // flexBasis: 0,
    // border: "1px solid red",
    // justifyContent: "center",
    // borderRadius: "6px",
    // backgroundColor: "#fff",
    // padding: "16px",
    // boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    // overflow: "hidden",
  },
};

export default function PricingPage({
  classNames,
  customerId,
}: PricingPageProps) {
  const { data, error, isLoading } = useCustomSwr({
    url: `${API_URL}/public/products`,
  });

  let cusProductsRes: any;
  if (customerId) {
    const res = useCustomSwr({
      url: `${API_URL}/public/customers/${customerId}/products`,
    });

    cusProductsRes = res;
  }

  const [importantClasses, setImportantClasses] = useState<
    PricingPageProps["classNames"]
  >({});

  useEffect(() => {
    if (classNames) {
      const important = Object.entries(classNames).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: makeImportant(value),
        }),
        {}
      );
      setImportantClasses(important);
    }
  }, [classNames]);

  if (isLoading || (customerId && cusProductsRes?.isLoading)) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error</div>;
  }

  const mainProducts = data?.filter((product: any) => !product.is_add_on);
  const addOnProducts = data?.filter((product: any) => product.is_add_on);

  return (
    <PricingPageContext.Provider
      value={{
        customerId,
        cusProducts: cusProductsRes?.data,
        cusMutate: cusProductsRes?.mutate,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flexWrap: "wrap",
          width: "100%",
        }}
      >
        <div style={styles.container} className={classNames?.container}>
          {mainProducts?.map((product: any, index: number) => (
            <PricingCard
              key={index}
              product={product}
              classNames={importantClasses}
            />
          ))}
        </div>
        <div style={styles.container} className={classNames?.container}>
          {addOnProducts?.map((product: any, index: number) => (
            <PricingCard
              key={index}
              product={product}
              classNames={importantClasses}
            />
          ))}
        </div>
      </div>
    </PricingPageContext.Provider>
  );
}
