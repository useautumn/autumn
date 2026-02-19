import { autumnHandler } from "autumn-js/backend/next";
import { SDK_TEST_IDENTITY } from "./testIdentity";

/** Set to true to simulate an unauthenticated user */
const SIMULATE_UNAUTHENTICATED = false;

export const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  autumnURL: "http://localhost:8080",
  identify: async () => (SIMULATE_UNAUTHENTICATED ? null : SDK_TEST_IDENTITY),
});
