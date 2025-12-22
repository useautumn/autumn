/**
 * Bun test preload script for integration tests.
 * Loads environment variables before any test file runs.
 */
import { loadLocalEnv } from "../src/utils/envUtils.js";

console.log("--- Setup integration tests ---");
await loadLocalEnv();
console.log("--- Setup integration tests complete ---");
