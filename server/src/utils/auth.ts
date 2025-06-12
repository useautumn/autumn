import { betterAuth } from "better-auth";
import { emailOTP, admin, organization } from "better-auth/plugins";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authDb } from "@/db/initDrizzle.js"; // your drizzle instance
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: "pg", // or "mysql", "sqlite"
  }),
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  trustedOrigins: ["http://localhost:3000"],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        // Implement the sendVerificationOTP method to send the OTP to the user's email address
      },
    }),
    admin(),
    organization({
      schema: {
        organization: {
          modelName: "organizations",
          fields: {
            createdAt: "createdAt",
          },
        },
      },

      organizationCreation: {
        disabled: false,
        afterCreate: async ({ organization, user }) => {
          // await saveOrgToDB({
          //   db,
          //   id: org.id,
          //   slug: org.slug,
          // });
        },
      },
    }),
  ],
});
