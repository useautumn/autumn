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
	"https://localhost:8080",
];

/** Allow any localhost origin in dev for multi-worktree support */
export const isAllowedOrigin = (origin: string): string | undefined => {
	if (ALLOWED_ORIGINS.includes(origin)) return origin;
	if (
		process.env.NODE_ENV !== "production" &&
		/^https?:\/\/localhost:\d+$/.test(origin)
	) {
		return origin;
	}
	return undefined;
};
