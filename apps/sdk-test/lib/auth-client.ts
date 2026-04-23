"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import {
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient(), passkeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
