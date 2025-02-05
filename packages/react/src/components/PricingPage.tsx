"use client";
import React, { useState, useEffect } from "react";
import { useCustomSwr } from "../hooks/useCustomSwr";
import { PricingPageProps } from "./models";
import { PricingCard } from "./PricingCard";
import { PricingPageContext } from "./PricingPageContext";

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
    gap: "1rem",
    justifyContent: "space-between",
    width: "100%",
  },
};

export default function PricingPage({
  classNames,
  customerId,
}: PricingPageProps) {
  const { data, error, isLoading } = useCustomSwr({
    // url: "https://api.useautumn.com/public/products",
    url: "http://localhost:8080/public/products",
  });

  let cusProductsRes: any;
  if (customerId) {
    const res = useCustomSwr({
      url: `http://localhost:8080/public/customers/${customerId}/products`,
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

  if (error || (customerId && cusProductsRes?.error)) {
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
          gap: "2rem",
          // flexWrap: "wrap",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            // border: "1px solid red",
            paddingBottom: "0",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", fontWeight: "500" }}>Pricing</h2>
          <div style={styles.container} className={classNames?.container}>
            {mainProducts?.map((product: any, index: number) => (
              <PricingCard
                key={index}
                product={product}
                classNames={importantClasses}
              />
            ))}
          </div>
        </div>
        {addOnProducts && addOnProducts.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ fontSize: "1.2rem", fontWeight: "500" }}>Add-ons</h2>
            <div style={styles.container} className={classNames?.container}>
              {addOnProducts.map((product: any, index: number) => (
                <PricingCard
                  key={index}
                  product={product}
                  classNames={importantClasses}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </PricingPageContext.Provider>
  );
}
