import { useEffect, useRef, useState } from "react";
import { API_URL } from "../constants";

import { PricingPageProps } from "./models";
import { usePricingPageContext } from "./PricingPageContext";
import React from "react";
import { useAutumnContext } from "../providers/AutumnContext";
import { motion } from "framer-motion";

import { CircleCheck } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";

const styles = {
  card: {
    display: "flex",
    flexDirection: "column" as const,
    position: "relative" as const,
    alignItems: "flex-start",
    gap: "1rem",
    // overflow: "hidden",
    // borderRadius: "6px",
    // minWidth: "300px",
    width: "100%",
    // maxWidth: "450px",
    height: "auto",
    // padding: "10px",
    // backgroundColor: "white",
    background: "linear-gradient(to top, #f4f4f4 1%, white 40%)",
    padding: "0.8rem",
    boxShadow: "0 0.5px 2px 0 rgba(0, 0, 0, 0.3)",
    borderRadius: "6px",
  },

  header: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    borderBottom: "1px solid #e5e5e5",
  },

  titleSection: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "1rem",
    // border: "1px solid blue",
  },
  title: {
    fontSize: "0.8rem",
    fontWeight: 500,
    // fontWeight: 600,
    color: "#111",
    marginBottom: "0.8rem",
    // zIndex: 2,
  },
  description: {
    fontSize: "0.8rem",
    color: "#111",
  },
  content: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "24px",
    padding: "48px",
    backgroundColor: "#fff",
  },
  pricing: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.3rem",
    // border: "1px solid red",
  },
  amount: {
    fontSize: "2rem",
    fontWeight: 500,
    color: "#111",
    // border: "1px solid blue",
    lineHeight: "2rem", // Match the font size to align text at bottom
    display: "flex",
    alignItems: "flex-end", // Align text to bottom of container
  },
  interval: {
    fontSize: "0.8rem",
    lineHeight: "0.8rem",
    color: "gray",
    paddingBottom: "4px",
  },
  entitlementsList: {
    display: "flex",
    padding: "0.8rem",
    width: "100%",
    flexDirection: "column" as const,
    gap: "8px",
    fontSize: "0.9rem",
  },
  entitlementItem: {
    display: "flex",
    // position: "relative" as const,
    alignItems: "center",
    gap: "4px",
    color: "#666",
  },
  purchaseButton: {
    display: "flex",
    // position: "relative" as const,
    alignItems: "center",
    justifyContent: "center",
    // fontWeight: 300,
    fontSize: "0.9rem",
    color: "white",
    background: "linear-gradient(to bottom, #3c86fa, #1560FC)",
    border: "1px solid #0252f7",
    borderRadius: "6px",
    padding: "0.3rem 1rem",
    width: "100%",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.3)",
    zIndex: 2,
  },
};

interface PricingCardProps {
  product: any;
  classNames?: PricingPageProps["classNames"];
}

enum EntInterval {
  Month = "month",
  Year = "year",
  Lifetime = "lifetime",
}

enum AllowanceType {
  Unlimited = "unlimited",
  None = "none",
  Fixed = "fixed",
}

enum BillingInterval {
  OneOff = "one_off",
  Month = "month",
  Year = "year",
}

enum BillingType {
  UsageInAdvance = "usage_in_advance",
  UsageBelowThreshold = "usage_below_threshold",
  UsageInArrears = "usage_in_arrears",
}

enum FeatureType {
  Boolean = "boolean",
  Usage = "usage",
}

export const PricingCard = ({ product, classNames = {} }: PricingCardProps) => {
  const { cusProducts, customerId, cusMutate } = usePricingPageContext();
  const { publishableKey } = useAutumnContext();

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [userOptions, setUserOptions] = useState<any>([]);
  const [buttonLoading, setButtonLoading] = useState(false);

  const fixedPrices = product.fixed_prices;
  const usagePrices = product.usage_prices;
  const entitlements = product.entitlements;

  const fixedPriceFree = !fixedPrices.some(
    (price: any) => price.config.amount !== 0
  );

  const getUsagePriceEntitlement = (usagePrice: any) => {
    const entitlement = entitlements.find(
      (entitlement: any) =>
        entitlement.internal_feature_id === usagePrice.internal_feature_id
    );
    return entitlement;
  };

  const formatEntitlement = (entitlement: any, withInterval = true) => {
    const feature = entitlement.feature;
    const allowanceType = entitlement.allowance_type;
    const allowance = entitlement.allowance;

    if (feature.type == FeatureType.Boolean) {
      return feature.name;
    }

    // Feature string
    let featureString = feature.name;
    if (entitlement.allowance_type == AllowanceType.Unlimited) {
      featureString = `Unlimited ${feature.name}`;
      withInterval = false;
    } else if (entitlement.allowance_type == AllowanceType.Fixed) {
      featureString = `${entitlement.allowance} ${feature.name}`;
    } else if (entitlement.allowance_type == AllowanceType.None) {
      featureString = `${feature.name}`;
    }

    // Time string
    const interval = entitlement.interval;
    let timeString = "";
    if (interval == EntInterval.Lifetime) {
      timeString = "";
    } else {
      timeString = ` / ${interval}`;
    }

    return `${featureString}`;
    if (withInterval) {
      return `${featureString}${timeString}`;
    } else {
    }
  };

  const formatSingleUsagePrice = (usagePrice: any) => {
    const entitlement = getUsagePriceEntitlement(usagePrice);
    const feature = entitlement.feature;
    const usageTiers = usagePrice.config.usage_tiers;

    let priceString = "";
    if (usageTiers.length > 1) {
      priceString = `From ${usageTiers[0].amount}`;
    } else {
      priceString = `${usageTiers[0].amount}`;
    }

    const featureString = formatEntitlement(entitlement, false);

    if (usagePrice.billing_type === BillingType.UsageInAdvance) {
      const billingInterval = usagePrice.config.interval;

      if (billingInterval == BillingInterval.OneOff) {
        // return `${priceString} / ${featureString}`;
        return (
          <>
            <span style={styles.amount}>${priceString}</span>
            <span style={styles.interval}>per {featureString}</span>
          </>
        );
      } else {
        // return `${priceString} / ${featureString} / ${billingInterval}`;
        return (
          <>
            <span style={styles.amount}>${priceString}</span>
            <span style={styles.interval}>per {featureString},</span>
            <span style={styles.interval}>per {billingInterval}</span>
          </>
        );
      }
    }

    // 2. Billing type is below threshold
    if (usagePrice.billing_type === BillingType.UsageBelowThreshold) {
      // return `${priceString} / ${featureString}`;
      return (
        <>
          <span style={styles.amount}>${priceString}</span>
          <span style={styles.interval}>per {featureString}</span>
        </>
      );
    }

    // 3. Billing type is usage in arrears
    if (usagePrice.billing_type === BillingType.UsageInArrears) {
      // return `${priceString} / ${featureString}`;
      return (
        <>
          <span style={styles.amount}>${priceString}</span>
          <span style={styles.interval}>per {featureString}</span>
        </>
      );
    }

    // return "Free";
    return (
      <>
        <span style={styles.amount}>Free</span>
      </>
    );
  };

  const getMainPrice = () => {
    for (const price of fixedPrices) {
      if (price.config.amount !== 0) {
        return (
          <>
            <span style={styles.amount}>${price.config.amount}</span>
            <span style={styles.interval}>per {price.config.interval}</span>
          </>
        );
      }
    }

    // If multiple usage price:
    if (usagePrices.length > 1) {
      // return `Varies`;
      return (
        <>
          <span style={styles.amount}>Varies</span>
        </>
      );
    }

    if (usagePrices.length === 1) {
      return formatSingleUsagePrice(usagePrices[0]);
    }

    return (
      <>
        <span style={styles.amount}>Free</span>
      </>
    );
  };

  // 1. Get remaining entitlements
  const getRemainingEntitlementsSorted = () => {
    let remainingEntitlements = [...entitlements];

    if (fixedPriceFree && usagePrices.length > 0) {
      // Filter entitlement in first usage price
      remainingEntitlements = remainingEntitlements.filter(
        (e) => e.internal_feature_id !== usagePrices[0].internal_feature_id
      );
    }

    // Sort remaining entitlements
    remainingEntitlements.sort((a, b) => {
      // 1. Check if usage price exists
      const aUsagePrice = usagePrices.find(
        (price: any) => price.internal_feature_id === a.internal_feature_id
      );
      const bUsagePrice = usagePrices.find(
        (price: any) => price.internal_feature_id === b.internal_feature_id
      );

      if (aUsagePrice && !bUsagePrice) {
        return -1;
      }

      if (!aUsagePrice && bUsagePrice) {
        return 1;
      }

      return a.feature.name.localeCompare(b.feature.name);
    });

    return remainingEntitlements;
  };

  const renderEntitlements = (remainingEntitlements: any) => {
    return remainingEntitlements.map((ent: any, index: number) => {
      const featureString = formatEntitlement(ent, true);

      return (
        <div key={index} style={styles.entitlementItem}>
          {/* <div
            style={{
              position: "relative" as const,
              // width: "",
              // border: "1px solid red",
              height: "0.8rem",
              paddingLeft: "1rem",
              paddingRight: "0.5rem",
            }}
          >
            <CornerDownRight
              style={{
                width: "0.8rem",
                height: "0.8rem",
                position: "absolute" as const,
                left: "50%",
                transform: "translate(-50%, -3px)",
              }}
            />
          </div> */}
          <CircleCheck
            strokeWidth={2}
            stroke="dimgrey"
            fill="lightgrey"
            style={{
              width: "0.9rem",
              height: "0.9rem",
              marginRight: "0.1rem",
            }}
          />
          {featureString}
        </div>
      );
    });
  };

  // Purchase Button

  const getActiveAndScheduled = () => {
    if (!cusProducts) {
      return { isActive: false, isScheduled: false };
    }

    const mainProducts = cusProducts.main;

    const isActive = mainProducts.some(
      (mainProduct: any) =>
        mainProduct.id === product.id && mainProduct.status === "active"
    );

    const isScheduled = mainProducts.some(
      (mainProduct: any) =>
        mainProduct.id === product.id && mainProduct.status === "scheduled"
    );

    return { isActive, isScheduled };
  };

  const renderButtonText = () => {
    if (!cusProducts) {
      return "Get Started";
    }

    const { isActive, isScheduled } = getActiveAndScheduled();

    if (isActive) {
      return "Current Plan";
    }

    if (isScheduled) {
      return "Scheduled";
    }

    return "Get Started";
  };

  const getProductOptions = async (productId: string) => {
    const res = await fetch(
      `${API_URL}/public/products/${product.id}/options`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-key": publishableKey,
        },
      }
    );

    const options = await res.json();
    return options;
  };

  const handleAttachProduct = async () => {
    const res = await fetch("/api/autumn", {
      method: "POST",
      body: JSON.stringify({
        product_id: product.id,
        customer_id: customerId,
        // options: userOptions,
        force_checkout: true,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (data.checkout_url) {
      window.open(data.checkout_url, "_blank");
    }

    if (cusMutate) {
      await cusMutate();
    }
  };

  const handleButtonClicked = async () => {
    const { isActive, isScheduled } = getActiveAndScheduled();

    const anotherScheduled =
      cusProducts &&
      cusProducts.main.some(
        (mainProduct: any) =>
          mainProduct.id !== product.id && mainProduct.status === "scheduled"
      );

    const notAllowed = isScheduled || (isActive && !anotherScheduled);
    // if (notAllowed) {
    //   return;
    // }

    setButtonLoading(true);
    console.log("Attaching product");

    try {
      // Get product options
      // const productOptions = await getProductOptions(product.id);

      // if (productOptions && productOptions.length > 0) {
      //   setOptionsOpen(true);
      //   setUserOptions(productOptions);
      // } else {
      // }
      await handleAttachProduct();
    } catch (error) {}

    setButtonLoading(false);
  };

  const optionsRef = useRef<HTMLDivElement>(null);

  return (
    <React.Fragment>
      {optionsOpen && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(255, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)", // for Safari support
          }}
          // On click outside
          onClick={(e) => {
            if (
              optionsRef.current &&
              !optionsRef.current.contains(e.target as Node)
            ) {
              setOptionsOpen(false);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              type: "spring",
              duration: 0.2,
              bounce: 0.2,
            }}
            style={{
              width: "500px",
              height: "300px",
              backgroundColor: "#fff",
              borderRadius: "10px",
              padding: "20px",
            }}
            ref={optionsRef}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3>Options</h3>
              <button onClick={() => setOptionsOpen(false)}>X</button>
            </div>
            {userOptions &&
              userOptions.map((option: any, index: number) => {
                console.log(option);

                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div>{option.feature_name}</div>
                    {option.quantity !== null &&
                      option.quantity !== undefined && (
                        <div>
                          <p>Quantity</p>
                          <input
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: "5px",
                              border: "1px solid #ccc",
                            }}
                            type="number"
                            value={option.quantity}
                            onChange={(e) => {
                              let newUserOptions = [...userOptions];
                              newUserOptions[index].quantity = e.target.value;
                              setUserOptions(newUserOptions);
                            }}
                          />
                        </div>
                      )}
                    {option.threshold !== null &&
                      option.threshold !== undefined && (
                        <div>
                          <p>Threshold</p>
                          <input
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: "5px",
                              border: "1px solid #ccc",
                            }}
                            type="number"
                            value={option.threshold}
                            onChange={(e) => {
                              let newUserOptions = [...userOptions];
                              newUserOptions[index].threshold = e.target.value;
                              setUserOptions(newUserOptions);
                            }}
                          />
                        </div>
                      )}
                  </div>
                );
              })}
            <button
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "5px",
              }}
              onClick={handleAttachProduct}
            >
              Attach
            </button>
          </motion.div>
        </div>
      )}
      <div style={styles.card} className={classNames.card}>
        {buttonLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            style={{
              position: "absolute" as const,
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.5)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              zIndex: 1,
              borderRadius: "6px",
            }}
          />
        )}
        <div style={styles.header} className={classNames.header}>
          <div style={styles.titleSection} className={classNames.titleSection}>
            <div style={styles.title} className={classNames.title}>
              {product.name}
            </div>
            <div style={styles.pricing}>{getMainPrice()}</div>
            <button style={styles.purchaseButton} onClick={handleButtonClicked}>
              {buttonLoading ? <LoadingSpinner /> : renderButtonText()}
            </button>
          </div>
        </div>
        {(() => {
          const remainingEntitlements = getRemainingEntitlementsSorted();
          return remainingEntitlements.length > 0 ? (
            <div style={styles.entitlementsList}>
              {renderEntitlements(remainingEntitlements)}
            </div>
          ) : null;
        })()}
        {/* Show usage prices with entitlements first */}
        {/* <div style={styles.content} className={classNames.content}>
          {firstFixedPrice && (
            <div style={styles.pricing} className={classNames.pricing}>
              <span style={styles.amount} className={classNames.amount}>
                ${firstFixedPrice.config.amount}
              </span>
              <div style={styles.interval} className={classNames.interval}>
                per {firstFixedPrice.config.interval}
              </div>
            </div>
          )}
          <div
            style={styles.entitlementsList}
            className={classNames.entitlementsList}
          >
            {entitlements.map((entitlement: any, index: number) => (
              <div
                key={index}
                style={styles.entitlementItem}
                className={classNames.entitlementItem}
              >
                <span>✓</span>
                <span>{entitlement.feature.name}</span>
              </div>
            ))}
          </div>
        </div> */}
      </div>
    </React.Fragment>
  );
};
