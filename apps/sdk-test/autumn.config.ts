import { feature, item, plan } from "atmn";

// Features
export const chat_messages = feature({
  id: "chat_messages",
  name: "Chat Messages",
  type: "metered",
  consumable: true,
});

export const editors = feature({
  id: "editors",
  name: "Editors",
  type: "metered",
  consumable: false,
});

export const pages = feature({
  id: "pages",
  name: "Pages",
  type: "metered",
  consumable: false,
});

export const domains = feature({
  id: "domains",
  name: "Domains",
  type: "metered",
  consumable: false,
});

// Plans
export const free = plan({
  id: "free",
  name: "Free",
  autoEnable: true,
  items: [
    item({
      featureId: editors.id,
      included: 1,
    }),
    item({
      featureId: pages.id,
      included: 5,
    }),
  ],
});

export const prepaid_credits = plan({
  id: "prepaid_credits",
  name: "Prepaid Credits",
  items: [
    item({
      featureId: chat_messages.id,
      included: 0,
      price: {
        amount: 1,
        billingUnits: 1,
        billingMethod: "prepaid",
        interval: "one_off",
      },
    }),
  ],
});

export const startup = plan({
  id: "startup",
  name: "Startup",
  price: {
    amount: 150,
    interval: "month",
  },
  items: [
    item({
      featureId: chat_messages.id,
      included: 100,
      price: {
        amount: 0.5,
        billingUnits: 1,
        billingMethod: "usage_based",
        interval: "month",
      },
    }),
  ],
});

export const growth = plan({
  id: "growth",
  name: "Growth",
  price: {
    amount: 400,
    interval: "month",
  },
  items: [
    item({
      featureId: editors.id,
      included: 20,
    }),
    item({
      featureId: pages.id,
      unlimited: true,
    }),
  ],
});

export const ultra = plan({
  id: "ultra",
  name: "Ultra",
  price: {
    amount: 1000,
    interval: "month",
  },
  items: [
    item({
      featureId: editors.id,
      included: 10,
    }),
  ],
});
