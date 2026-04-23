import { passkey } from "@better-auth/passkey";
import { autumn } from "autumn-js/better-auth";
import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";
import { db } from "./db";

export const auth = betterAuth({
  appName: "Autumn SDK Test",
  database: {
    db,
    type: "postgres",
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(),
    twoFactor({ allowPasswordless: true }),
    passkey({ rpName: "Autumn SDK Test" }),
    autumn({
      secretKey: process.env.AUTUMN_SECRET_KEY,
      autumnURL: "http://localhost:8080",
      customerScope: "user_and_organization",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
