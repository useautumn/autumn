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
	"quickstart",
	"impersonate-redirect",
	"trmnl",
]);

export const sandboxSlug = (name: string): string =>
	name
		.toLowerCase()
		.replace(/ /g, "-")
		.replace(/[^\w\s-]/g, "");

export const validateSandboxName = (name: string): string | null => {
	const slug = sandboxSlug(name);
	if (!slug) {
		return "Name must include at least one letter or number";
	}
	if (RESERVED_SANDBOX_SLUGS.has(slug)) {
		return `"${name}" is a reserved name, pick another`;
	}
	return null;
};
