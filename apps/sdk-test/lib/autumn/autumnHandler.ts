import { autumnHandler } from "autumn-js/next";
import { SDK_TEST_IDENTITY } from "./testIdentity";

const SIMULATE_UNAUTHENTICATED = false;

export const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  identify: async () => (SIMULATE_UNAUTHENTICATED ? null : SDK_TEST_IDENTITY),
});
