// Copied by @autumn/atmn-generator from shared/models/orgModels/sandboxName.ts.
// Do not edit — change that file and run `bun generate` instead.

// Single source of truth for sandbox-name -> URL-slug rules, consumed by the
// dashboard router and the server create/update guards. The reserved set mirrors
// the top-level /sandbox/<page> route names so a slug can't shadow a real route.
export const RESERVED_SANDBOX_SLUGS = new Set([
	"products",
	"customers",
	"features",
	"migrations",
	"dev",
	"analytics",
	"settings",
	"admin",
	"chat",
	"quickstart",
	"onboarding",
	"impersonate-redirect",
	"trmnl",
]);

// A sandbox slug can stand in for an env name, so it must never read as one.
const ENV_SANDBOX_SLUGS = new Set(["live", "sandbox"]);

export const sandboxSlug = (name: string): string =>
	name
		.toLowerCase()
		.replace(/ /g, "-")
		.replace(/[^\w\s-]/g, "");

export const SANDBOX_NAME_SPACES_MESSAGE =
	"Name can't contain spaces. Use - or _ instead";

/** Rules for a new name. Existing names that break the space rule stay valid,
 * so callers skip this when a name is unchanged. */
export const validateSandboxName = (name: string): string | null => {
	if (/\s/.test(name)) {
		return SANDBOX_NAME_SPACES_MESSAGE;
	}
	const slug = sandboxSlug(name);
	if (!slug) {
		return "Name must include at least one letter or number";
	}
	if (RESERVED_SANDBOX_SLUGS.has(slug)) {
		return `"${name}" is a reserved name, pick another`;
	}
	if (ENV_SANDBOX_SLUGS.has(slug)) {
		return `"${name}" is reserved for environment names, pick another`;
	}
	return null;
};
