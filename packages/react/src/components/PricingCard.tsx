import { useState } from "react";

import { PricingPageProps } from "./models";
import { usePricingPageContext } from "./PricingPageContext";
import React from "react";
import { useAutumnContext } from "../providers/AutumnContext";
import { motion } from "framer-motion";

import { CircleCheck } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import toast from "react-hot-toast";

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
    alignItems: "start",
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
  isAddOn?: boolean;
}

export const PricingCard = ({
  product,
  classNames = {},
  isAddOn = false,
}: PricingCardProps) => {
  const { cusProducts, customerId, cusMutate } = usePricingPageContext();
  const { endpoint, publishableKey } = useAutumnContext();
  const [buttonLoading, setButtonLoading] = useState(false);

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

  const handleAttachProduct = async () => {
    const res = await fetch(`${endpoint}/public/attach`, {
      method: "POST",
      body: JSON.stringify({
        product_id: product.id,
        customer_id: customerId,
      }),
      headers: {
        "Content-Type": "application/json",
        "x-publishable-key": publishableKey,
      },
    });

    // Check res.error
    if (res.status !== 200) {
      // Get data
      const data = await res.json();

      if (data.message) {
        toast.error(data.message);
      } else {
        toast.error("Failed to attach product");
      }
      return;
    }

    toast.success("Product attached successfully");

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

    if (notAllowed) {
      toast.error("Already on this plan");
      return;
    }

    setButtonLoading(true);

    try {
      await handleAttachProduct();
    } catch (error) {}

    setButtonLoading(false);
  };

  return (
    <React.Fragment>
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
            <div style={styles.pricing}>
              <span style={styles.amount}>{product.main_price.amount}</span>
              <span style={styles.interval}>{product.main_price.interval}</span>
            </div>
            <button style={styles.purchaseButton} onClick={handleButtonClicked}>
              {buttonLoading ? <LoadingSpinner /> : renderButtonText()}
            </button>
          </div>
        </div>
        <div style={styles.entitlementsList}>
          {product.entitlements.map((ent: any, index: number) => (
            <div key={index} style={styles.entitlementItem}>
              <CircleCheck
                strokeWidth={2}
                stroke="dimgrey"
                fill="lightgrey"
                style={{
                  marginTop: "0.21rem",
                  width: "0.9rem",
                  minWidth: "0.9rem",
                  maxWidth: "0.9rem",
                  height: "0.9rem",
                  marginRight: "0.1rem",
                }}
              />
              {ent.value}
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
};

// OPTIONS
// {optionsOpen && (
//   <div
//     style={{
//       position: "absolute",
//       top: 0,
//       left: 0,
//       width: "100%",
//       height: "100%",
//       zIndex: 1000,
//       display: "flex",
//       justifyContent: "center",
//       alignItems: "center",
//       backgroundColor: "rgba(255, 0, 0, 0.5)",
//       backdropFilter: "blur(4px)",
//       WebkitBackdropFilter: "blur(4px)", // for Safari support
//     }}
//     // On click outside
//     onClick={(e) => {
//       if (
//         optionsRef.current &&
//         !optionsRef.current.contains(e.target as Node)
//       ) {
//         setOptionsOpen(false);
//       }
//     }}
//   >
//     <motion.div
//       initial={{ opacity: 0, scale: 0.8 }}
//       animate={{ opacity: 1, scale: 1 }}
//       exit={{ opacity: 0, scale: 0.8 }}
//       transition={{
//         type: "spring",
//         duration: 0.2,
//         bounce: 0.2,
//       }}
//       style={{
//         width: "500px",
//         height: "300px",
//         backgroundColor: "#fff",
//         borderRadius: "10px",
//         padding: "20px",
//       }}
//       ref={optionsRef}
//     >
//       {/* Header */}
//       <div
//         style={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//         }}
//       >
//         <h3>Options</h3>
//         <button onClick={() => setOptionsOpen(false)}>X</button>
//       </div>
//       {userOptions &&
//         userOptions.map((option: any, index: number) => {
//           console.log(option);

//           return (
//             <div
//               key={index}
//               style={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "10px",
//               }}
//             >
//               <div>{option.feature_name}</div>
//               {option.quantity !== null &&
//                 option.quantity !== undefined && (
//                   <div>
//                     <p>Quantity</p>
//                     <input
//                       style={{
//                         width: "100%",
//                         padding: "10px",
//                         borderRadius: "5px",
//                         border: "1px solid #ccc",
//                       }}
//                       type="number"
//                       value={option.quantity}
//                       onChange={(e) => {
//                         let newUserOptions = [...userOptions];
//                         newUserOptions[index].quantity = e.target.value;
//                         setUserOptions(newUserOptions);
//                       }}
//                     />
//                   </div>
//                 )}
//               {option.threshold !== null &&
//                 option.threshold !== undefined && (
//                   <div>
//                     <p>Threshold</p>
//                     <input
//                       style={{
//                         width: "100%",
//                         padding: "10px",
//                         borderRadius: "5px",
//                         border: "1px solid #ccc",
//                       }}
//                       type="number"
//                       value={option.threshold}
//                       onChange={(e) => {
//                         let newUserOptions = [...userOptions];
//                         newUserOptions[index].threshold = e.target.value;
//                         setUserOptions(newUserOptions);
//                       }}
//                     />
//                   </div>
//                 )}
//             </div>
//           );
//         })}
//       <button
//         style={{
//           backgroundColor: "#000",
//           color: "#fff",
//           padding: "10px 20px",
//           borderRadius: "5px",
//         }}
//         onClick={handleAttachProduct}
//       >
//         Attach
//       </button>
//     </motion.div>
//   </div>
// )}
