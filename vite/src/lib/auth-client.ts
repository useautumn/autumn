import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";

export const { useSession, signIn, signUp, signOut, deleteUser } =
  createAuthClient({
    baseURL: "http://localhost:8080",
    plugins: [emailOTPClient(), organizationClient()],
  });
