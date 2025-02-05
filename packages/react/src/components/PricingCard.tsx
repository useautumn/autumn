import { useEffect, useRef, useState } from "react";
import { API_URL } from "../constants";

import { PricingPageProps } from "./models";
import { usePricingPageContext } from "./PricingPageContext";
import React from "react";
import { useAutumnContext } from "../providers/AutumnContext";
import { motion } from "motion/react";

const styles = {
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    overflow: "hidden",
    borderRadius: "6px",
    border: "1px solid #eee",
    // minWidth: "300px",
    width: "100%",
    maxWidth: "450px",
    height: "100%",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    backgroundColor: "#eee",
    padding: "10px",
  },

  header: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "16px",
    borderBottom: "1px solid #e5e5e5",
    backgroundColor: "#fafafa",
    padding: "48px",
  },

  titleSection: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "8px",
  },
  title: {
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#111",
  },
  description: {
    fontSize: "18px",
    fontWeight: 500,
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
    gap: "8px",
  },
  amount: {
    fontSize: "32px",
    fontWeight: 600,
    color: "#111",
  },
  interval: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#666",
    paddingBottom: "4px",
  },
  entitlementsList: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    gap: "8px",
  },
  entitlementItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "16px",
    color: "#666",
  },
  purchaseButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "16px",
    color: "#666",
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

    if (withInterval) {
      return `${featureString}${timeString}`;
    } else {
      return `${featureString}`;
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
        return `${priceString} / ${featureString}`;
      } else {
        return `${priceString} / ${featureString} / ${billingInterval}`;
      }
    }

    // 2. Billing type is below threshold
    if (usagePrice.billing_type === BillingType.UsageBelowThreshold) {
      return `${priceString} / ${featureString}`;
    }

    // 3. Billing type is usage in arrears
    if (usagePrice.billing_type === BillingType.UsageInArrears) {
      return `${priceString} / ${featureString}`;
    }

    return "Free";
  };

  const getMainPrice = () => {
    for (const price of fixedPrices) {
      if (price.config.amount !== 0) {
        return `${price.config.amount} / ${price.config.interval}`;
      }
    }

    // If multiple usage price:
    if (usagePrices.length > 1) {
      return `Varies`;
    }

    if (usagePrices.length === 1) {
      return formatSingleUsagePrice(usagePrices[0]);
    }

    return "Free";
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

  const renderEntitlements = () => {
    const remainingEntitlements = getRemainingEntitlementsSorted();

    if (remainingEntitlements.length === 0) {
      return <div>No entitlements</div>;
    }

    return remainingEntitlements.map((ent: any, index: number) => {
      const featureString = formatEntitlement(ent, true);

      return <div key={index}>- {featureString}</div>;
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
        options: userOptions,
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

    try {
      // Get product options
      const productOptions = await getProductOptions(product.id);

      if (productOptions && productOptions.length > 0) {
        setOptionsOpen(true);
        setUserOptions(productOptions);
      } else {
        await handleAttachProduct();
      }
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
            backgroundColor: "rgba(0, 0, 0, 0.5)",
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
        <div style={styles.header} className={classNames.header}>
          <div style={styles.titleSection} className={classNames.titleSection}>
            <div style={styles.title} className={classNames.title}>
              {product.name}
            </div>
            <div>{getMainPrice()}</div>
            <button
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "5px",
              }}
              onClick={handleButtonClicked}
            >
              {/* Add loading spinner if buttonLoading is true */}
              {buttonLoading ? (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      borderTop: "2px solid transparent",
                      animation: "spin 1s linear infinite",
                    }}
                  ></div>
                </div>
              ) : (
                renderButtonText()
              )}
            </button>
          </div>
        </div>
        {renderEntitlements()}
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
