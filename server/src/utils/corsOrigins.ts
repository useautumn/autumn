export const ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
	"http://localhost:3003",
	"http://localhost:3004",
	"http://localhost:3005",
	"http://localhost:3006",
	"http://localhost:3007",
	"http://localhost:5173",
	"http://localhost:5174",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
	"https://dev.useautumn.com",
	"https://api.staging.useautumn.com",
	"https://checkout.useautumn.com",
	"https://localhost:8080",
];

// Comma-separated hostname suffixes injected by per-developer tooling (e.g.
// agent worktree tunnels). Each entry matches `<anything>.<suffix>` over
// http or https. Dev-only — never consulted in production.
function devExtraSuffixes(): string[] {
	return (process.env.DEV_EXTRA_CORS_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function matchesDevExtraSuffix(origin: string, suffixes: string[]): boolean {
	if (suffixes.length === 0) return false;
	let host: string;
	try {
		host = new URL(origin).hostname;
	} catch {
		return false;
	}
	return suffixes.some((sfx) => host === sfx || host.endsWith(`.${sfx}`));
}

/** Allow any *.localhost or localhost origin in dev for multi-worktree support */
export const isAllowedOrigin = (origin: string): string | undefined => {
	if (ALLOWED_ORIGINS.includes(origin)) return origin;
	if (process.env.NODE_ENV === "production") return undefined;
	if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/.test(origin)) {
		return origin;
	}
	if (matchesDevExtraSuffix(origin, devExtraSuffixes())) return origin;
	return undefined;
};
