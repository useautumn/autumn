import { betterAuth } from "better-auth";
import { emailOTP, admin, organization } from "better-auth/plugins";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
// import { authDb } from "@/db/initDrizzle.js"; // your drizzle instance
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";
import { db } from "@/db/initDrizzle.js";
import { member, session as sessionTable } from "@autumn/shared";
import { desc, eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          let lastSession = await db
            .select()
            .from(sessionTable)
            .where(eq(sessionTable.userId, session.userId))
            .orderBy(desc(sessionTable.createdAt))
            .limit(1);

          if (!lastSession) {
            return {
              data: {
                ...session,
                activeOrganizationId: null,
              },
            };
          }

          if (lastSession[0].activeOrganizationId) {
            return {
              data: {
                ...session,
                activeOrganizationId: lastSession[0].activeOrganizationId,
              },
            };
          }

          let memberships = await db
            .select()
            .from(member)
            .where(eq(member.userId, session.userId));

          if (memberships.length > 0) {
            return {
              data: {
                ...session,
                activeOrganizationId: memberships[0].organizationId,
              },
            };
          }

          return { data: session };
        },
      },
    },
  },
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
          await saveOrgToDB({
            db,
            id: organization.id,
            slug: organization.slug,
          });
        },
      },
    }),
  ],
});
