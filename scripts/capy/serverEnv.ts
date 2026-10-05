import {
	FAKECLOUD_ACCOUNT_ID,
	FAKECLOUD_SCHEDULER_ROLE_ARN,
} from "../dw/helpers/fakecloud.ts";

// Capy v2 discovers listening HTTP services automatically. Its desktop
// service moved off :8080, so Autumn can use its standard local ports again.
export const SERVER_PORT = 8080;
export const VITE_PORT = 3000;
export const DRAGONFLY_PORT = 6379;
export const FAKECLOUD_PORT = 4566;
export const TRIGGER_PORT = 8030;
export const KAFKA_PORT = 19092;

export type CapySecrets = {
	betterAuthSecret: string;
	encryptionIv: string;
	encryptionPassword: string;
};

function forceSslVerifyFull(url: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set("sslmode", "verify-full");
		return u.toString();
	} catch {
		return url;
	}
}

export function capyEnvFiles({
	machineId,
	databaseUrl,
	secrets,
	trigger,
}: {
	machineId: string;
	databaseUrl: string;
	secrets: CapySecrets;
	/** Absent when Trigger.dev is not opted in, so the server builds no Trigger client. */
	trigger?: { secretKey: string; accessToken: string };
}): {
	server: Record<string, string>;
	vite: Record<string, string>;
	checkout: Record<string, string>;
} {
	const serverUrl = `http://localhost:${SERVER_PORT}`;
	const viteUrl = `http://localhost:${VITE_PORT}`;

	const dbUrl = forceSslVerifyFull(databaseUrl);
	const redisUrl = `redis://localhost:${DRAGONFLY_PORT}`;
	const sqsBase = `http://localhost:${FAKECLOUD_PORT}/${FAKECLOUD_ACCOUNT_ID}`;

	const serverEnv: Record<string, string> = {
		// scripts/preload-env.ts ignores these files on any other machine.
		CAPY_MACHINE_ID: machineId,
		SERVER_PORT: String(SERVER_PORT),
		// server/src/utils/initUtils.ts::checkEnvVars exits if any of these are
		// missing; legacy writeAgentEnv.ts handled the same set. Re-minted only
		// on first run — the values live in $CAPY_PREFIX/state.json.
		BETTER_AUTH_SECRET: secrets.betterAuthSecret,
		ENCRYPTION_IV: secrets.encryptionIv,
		ENCRYPTION_PASSWORD: secrets.encryptionPassword,
		DATABASE_URL: dbUrl,
		DATABASE_CRITICAL_URL: dbUrl,
		// Dragonfly serves the redis-protocol clients for every cache slot
		// (misc + v2). Matches dw env-files.ts.
		REDIS_URL: redisUrl,
		MISC_CACHE_DRAGONFLY_PUBLIC_URL: redisUrl,
		CACHE_V2_DRAGONFLY_URL: redisUrl,
		DYNAMODB_ENDPOINT: `http://localhost:${FAKECLOUD_PORT}`,
		KAFKA_BROKERS: `127.0.0.1:${KAFKA_PORT}`,
		KAFKA_AUTH_MODE: "none",
		SQS_QUEUE_URL: `${sqsBase}/autumn.fifo`,
		SQS_QUEUE_URL_V2: `${sqsBase}/autumn.fifo`,
		TRACK_SQS_QUEUE_URL: `${sqsBase}/autumn-track.fifo`,
		TRACK_ASYNC_SQS_QUEUE_URL: `${sqsBase}/autumn-track.fifo`,
		TRACK_ASYNC_STANDARD_SQS_QUEUE_URL: `${sqsBase}/autumn-track-async`,
		STRIPE_WEBHOOK_SQS_QUEUE_URL: `${sqsBase}/autumn-stripe-webhook.fifo`,
		AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN: FAKECLOUD_SCHEDULER_ROLE_ARN,
		// Blank rather than absent so an opt-out overwrites keys left by an earlier opt-in.
		TRIGGER_API_URL: trigger ? `http://localhost:${TRIGGER_PORT}` : "",
		TRIGGER_ACCESS_TOKEN: trigger?.accessToken ?? "",
		TRIGGER_SERVER_SECRET_KEY: trigger?.secretKey ?? "",

		AWS_REGION: "us-east-1",
		AWS_ACCESS_KEY_ID: "x",
		AWS_SECRET_ACCESS_KEY: "x",
		AUTUMN_API_URL: serverUrl,
		AUTUMN_PUBLIC_API_URL: serverUrl,
		CLIENT_URL: viteUrl,
		EMULATE_GOOGLE_URL: "http://localhost:4000",
		EMULATE_GOOGLE_FETCH_URL: "http://127.0.0.1:4000",
		GOOGLE_CLIENT_ID: "capy-emulate",
		GOOGLE_CLIENT_SECRET: "capy-emulate",
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		// Login flow that works without external services: dev `sendOTPEmail`
		// prints the OTP to the server log. The README documents this path.
		NODE_ENV: "development",
		TESTS_ORG: "unit-test-org",
		TESTS_ORG_ID: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
		AUTUMN_TEST_BASE_URL: serverUrl,
		AUTUMN_TEST_VITE_URL: viteUrl,
		CACHE_V2_DRAGONFLY_PUBLIC_URL: redisUrl,
	};

	const viteEnv: Record<string, string> = {
		VITE_BACKEND_URL: serverUrl,
		VITE_FRONTEND_URL: viteUrl,
	};

	const checkoutEnv: Record<string, string> = {
		VITE_BACKEND_URL: serverUrl,
		VITE_API_URL: serverUrl,
	};

	return { server: serverEnv, vite: viteEnv, checkout: checkoutEnv };
}
