/**
 * Packages left as real node_modules because inlining would change how they behave. Keep this
 * list minimal: inlining preserves each importer's resolved version, a shared top-level copy can't.
 */
export const EXTERNAL_PACKAGES = [
	// Native bindings
	"@duckdb/*",
	"@takumi-rs/*",
	// pino spawns worker threads from files beside its own source
	"pino",
	"thread-stream",
	// @react-email/tailwind reads its preflight CSS from disk; react must stay one instance
	"@react-email/*",
	"react",
	"react-dom",
	// grpc loads .proto files from its package directory
	"@grpc/grpc-js",
	// stripe-sync-engine finds its SQL migrations beside its own source
	"@supabase/stripe-sync-engine",
	// CommonJS imported only for side effects: a bundle runs these after sibling ESM imports,
	// external imports are hoisted and run first, as in source (x509 needs Reflect at load)
	"reflect-metadata",
	"dotenv",
];

/** CommonJS side-effect imports reviewed as order-insensitive (ioredis: type augmentation only). */
export const ORDER_INSENSITIVE_SIDE_EFFECT_IMPORTS = ["ioredis"];

/** Resolved by name at runtime (pino transport targets), so no import names them. */
export const RUNTIME_RESOLVED_PACKAGES = ["@axiomhq/pino"];

/** Build-path strings a bundle may keep: ioredis reads its package.json in a try/catch. */
export const ALLOWED_BUILD_PATH_LEAKS = ["/node_modules/.bun/ioredis@"];
