"use server";

import { Autumn } from "@/sdk/autumn";

// ONLY 3 ENDPOINTS NEEDED TO GET STARTED

// Entitled: Check if your user should be allowed to use a feature
export const entitled = async ({
  customerId,
  featureId,
}: {
  customerId: string;
  featureId: string;
}) => {
  const response = await fetch(`https://api.useautumn.com/v1/entitled`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      feature_id: featureId,
    }),
  });

  const data = await response.json();
  return data.allowed;
};

//Events: send a usage event to Autumn to track a user's usage of a feature
export const sendEvent = async ({
  customerId,
  featureId,
}: {
  customerId: string;
  featureId: string;
}) => {
  await fetch("https://api.useautumn.com/v1/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      feature_id: featureId,
    }),
  });
};

//Attach: get a checkout URL from Autumn so the user can upgrade
export const attachProduct = async ({
  customerId,
  productId,
}: {
  customerId: string;
  productId: string;
}) => {
  const response = await fetch(`https://api.useautumn.com/v1/attach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      product_id: productId,
      force_checkout: true,
    }),
  });

  const data = await response.json();
  if (response.status !== 200) {
    throw new Error(data.message || "Failed to attach pro product");
  }
  return data;
};

// ADDITIONAL ENDPOINT TO FETCH CUSTOMER DETAILS

export const getOrCreateCustomer = async (customerId: string) => {
  const response = await fetch(`https://api.useautumn.com/v1/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
    },
    body: JSON.stringify({
      id: customerId,
    }),
  });

  const data = await response.json();
  return data;
};

export const getCustomer = async (customerId: string) => {
  const autumn = new Autumn();

  const data = await autumn.customers.get(customerId);
  const { entitlements, invoices } = data;
  return data;
};
