import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:8080",
  plugins: [emailOTPClient(), organizationClient(), adminClient()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  deleteUser,
  useListOrganizations,
} = createAuthClient({
  baseURL: "http://localhost:8080",
  plugins: [emailOTPClient(), organizationClient(), adminClient()],
});
