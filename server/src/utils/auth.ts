import { betterAuth } from "better-auth";
import { emailOTP, admin, organization } from "better-auth/plugins";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
// import { authDb } from "@/db/initDrizzle.js"; // your drizzle instance
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";
import { db } from "@/db/initDrizzle.js";
import { invitation, member, session as sessionTable } from "@autumn/shared";
import { desc, eq } from "drizzle-orm";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";
import { sendInvitationEmail } from "@/internal/orgs/emails/sendInvitationEmail.js";
import { afterUserCreated } from "@/utils/authUtils/afterUserCreated.js";
import { beforeSessionCreated } from "./authUtils/beforeSessionCreated.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
  }),

  databaseHooks: {
    user: {
      create: {
        after: afterUserCreated,
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
        // try {
        //   const res = await auth.api.removeUser({
        //     body: {
        //       userId: user.id,
        //     },
        //   });
        //   console.log("Res:", res);
        // } catch (error) {
        //   console.log("Error:", error);
        // }
        // console.log("Res:", res);
        // const res2 = await fetch(url, {
        //   method: "GET",
        // });
        // const deleteData = await res2.json();
        // console.log("Delete account verification", deleteData);
      },
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
          });
        },
      },
    }),
  ],
});
