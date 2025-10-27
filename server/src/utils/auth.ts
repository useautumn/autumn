import "dotenv/config";

import { invitation } from "@autumn/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createLoopsContact } from "@/external/resend/loopsUtils.js";
import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { sendOnboardingEmail } from "@/internal/emails/sendOnboardingEmail.js";
import sendOTPEmail from "@/internal/emails/sendOTPEmail.js";
import { afterOrgCreated } from "./authUtils/afterOrgCreated.js";
import { beforeSessionCreated } from "./authUtils/beforeSessionCreated.js";
import { ADMIN_USER_IDs } from "./constants.js";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	telemetry: {
		enabled: false,
	},

	database: drizzleAdapter(db, {
		provider: "pg", // or "mysql", "sqlite"
	}),

	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createLoopsContact(user);
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
	trustedOrigins: (() => {
		const origins = [
			"http://localhost:3000",
			"https://app.useautumn.com",
			"https://staging.useautumn.com",
			"https://*.useautumn.com",
		];

		// Add dynamic port origins in development
		if (process.env.NODE_ENV === "development") {
			// Add ports 3000-3010 for multiple instances
			for (let i = 0; i <= 10; i++) {
				origins.push(`http://localhost:${3000 + i}`);
			}
		}

		return origins;
	})(),
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		requireEmailVerification: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
		autoSignIn: true,
		resetPasswordTokenExpiresIn: 3600, // 1 hour
	},

	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			redirectURI: `${process.env.BETTER_AUTH_URL}/api/auth/callback/google`,
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

				try {
					// Update invite to expire in 7 days
					await db
						.update(invitation)
						.set({
							expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
						})
						.where(eq(invitation.id, data.id));
				} catch (error) {
					logger.error("Error updating invite expiration date:", { error });
				}
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
					await afterOrgCreated({ org: organization, user });
				},
			},
		}),
	],
});
