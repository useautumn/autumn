import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  serverURL: "http://localhost:8080",
});

const res = await autumn.entities.update({
  entityId: "seat_1",
  billingControls: {
    spendLimits: [
      {
        featureId: "messages",
        enabled: true,
      },
    ],
  },
});

console.log("Res:", res);
