import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
	typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
	REDIS_URL: z.string().default("redis://localhost:6379"),
	SLACK_CLIENT_ID: z.string().optional(),
	SLACK_CLIENT_SECRET: z.string().optional(),
	SLACK_SIGNING_SECRET: z.string().optional(),
	ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required for storing tenant credentials"),
	ANTHROPIC_API_KEY: z.string().optional(),
	AUTUMN_BACKEND_URL: z.preprocess(
		emptyStringToUndefined,
		z.string().default("https://api.useautumn.com"),
	),
	AUTUMN_OAUTH_CLIENT_ID: z.string().min(1, "AUTUMN_OAUTH_CLIENT_ID is required"),
	AUTUMN_OAUTH_CLIENT_SECRET: z.string().min(1, "AUTUMN_OAUTH_CLIENT_SECRET is required"),
	PORT: z.coerce.number().default(3000),
	BASE_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
	if (!_env) {
		const result = envSchema.safeParse(process.env);
		if (!result.success) {
			console.error("Invalid environment variables:");
			for (const issue of result.error.issues) {
				console.error(`  ${issue.path.join(".")}: ${issue.message}`);
			}
			process.exit(1);
		}
		_env = result.data;
	}
	return _env;
}
