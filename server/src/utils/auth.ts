import { db } from "@/db/initDrizzle.js";
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sendInvitationEmail } from "@/internal/orgs/emails/sendInvitationEmail.js";
import { beforeSessionCreated } from "./authUtils/beforeSessionCreated.js";
import { betterAuth } from "better-auth";
import { emailOTP, admin, organization } from "better-auth/plugins";

import sendOTPEmail from "@/internal/orgs/emails/sendOTPEmail.js";
import { sendOnboardingEmail } from "@/external/webhooks/sendOnboardingEmail.js";
import { ADMIN_USER_IDs } from "./constants.js";
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
  }),

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await sendOnboardingEmail({
            name: user.name,
            email: user.email,
          });
        },
      },
    },
    session: {
      create: {
        before: beforeSessionCreated,
      },
    },
  },
  user: {
    deleteUser: {
      enabled: true,

      sendDeleteAccountVerification: async ({ user, url, token }) => {
        console.log("Delete account verification", { url, token });
      },
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "https://app.useautumn.com",
    "https://*.useautumn.com",
  ],
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
        await sendOTPEmail({
          email,
          otp,
        });
      },
    }),
    admin({
      adminUserIds: ADMIN_USER_IDs,
      impersonationSessionDuration: 1000 * 60 * 60 * 24, // 1 days
    }),

    organization({
      async sendInvitationEmail(data) {
        const inviteLink = `${process.env.CLIENT_URL}/accept?id=${data.id}`;
        await sendInvitationEmail({
          email: data.email,
          orgName: data.organization.name,
          inviteLink,
        });
      },
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
          await saveOrgToDB({
            db,
            id: organization.id,
            slug: organization.slug,
            createdAt: organization.createdAt,
          });
        },
      },
    }),
  ],
});
