import { autumn } from "autumn-js/better-auth";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { db } from "./db";

export const auth = betterAuth({
  database: {
    db,
    type: "postgres",
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(),
    autumn({
      secretKey: process.env.AUTUMN_SECRET_KEY,
      baseURL: process.env.NEXT_PUBLIC_URL,
      customerScope: "user_and_organization",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
