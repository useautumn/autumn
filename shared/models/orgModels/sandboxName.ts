export const RESERVED_SANDBOX_SLUGS = new Set([
	"products",
	"customers",
	"features",
	"migrations",
	"dev",
	"analytics",
	"logs",
	"settings",
	"admin",
	"chat",
	"quickstart",
	"onboarding",
	"impersonate-redirect",
	"trmnl",
]);

const ENV_SANDBOX_SLUGS = new Set(["live", "sandbox"]);

export const sandboxSlug = (name: string): string =>
	name
		.toLowerCase()
		.replace(/ /g, "-")
		.replace(/[^\w\s-]/g, "");

export const SANDBOX_NAME_SPACES_MESSAGE =
	"Name can't contain spaces. Use - or _ instead";

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
