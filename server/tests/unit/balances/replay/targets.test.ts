/**
 * The staging target guard proves a replay target matches the trusted operator
 * policy and the pinned staging deployment. It is not proof that the policy
 * itself points at staging, and it is not authorization to run a replay.
 */

import { describe, expect, test } from "bun:test";
import { validateReplayStagingTarget } from "@/internal/balances/replay/targets/validateReplayStagingTarget.js";

const STAGING_BROKERS = [
	"b-1.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-2.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-3.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-4.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
];
const STAGING_DEPLOYMENT = "tf-balance-staging-v2-512";
const STAGING_TOPIC = "tf-balance-staging-v2-512-ownership";
const STAGING_PARTITION_COUNT = 512;
const STAGING_REGION = "us-east-1";
const POLICY_HOSTNAME = "tf-balance-staging-db.internal";
const POLICY_PORT = 5432;
const POLICY_DATABASE = "balance_staging";
const DATABASE_USER = "replay_operator";
const DATABASE_SECRET = "sup3rsecret";
const STAGING_DATABASE_URL = `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`;

const buildPolicy = () => ({
	database: {
		hostname: POLICY_HOSTNAME,
		port: POLICY_PORT,
		database: POLICY_DATABASE,
	},
});

const buildTarget = (overrides: Record<string, unknown> = {}) => ({
	databaseUrl: STAGING_DATABASE_URL,
	brokers: [...STAGING_BROKERS],
	deployment: STAGING_DEPLOYMENT,
	topic: STAGING_TOPIC,
	partitionCount: STAGING_PARTITION_COUNT,
	region: STAGING_REGION,
	...overrides,
});

const validateTarget = (overrides: Record<string, unknown> = {}) =>
	validateReplayStagingTarget({
		target: buildTarget(overrides),
		policy: buildPolicy(),
	});

const validateDatabaseUrl = (databaseUrl: string) =>
	validateTarget({ databaseUrl });

const refusalMessageFor = (overrides: Record<string, unknown> = {}) => {
	try {
		validateTarget(overrides);
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("expected the replay staging target to be refused");
};

const refusalMessageForDatabaseUrl = (databaseUrl: string) =>
	refusalMessageFor({ databaseUrl });

describe("Replay staging target guard", () => {
	test.concurrent(
		"accepts the exact staging target regardless of broker order",
		() => {
			const target = validateTarget({
				brokers: [
					STAGING_BROKERS[3],
					STAGING_BROKERS[1],
					STAGING_BROKERS[0],
					STAGING_BROKERS[2],
				],
			});

			expect(target).toEqual({
				deployment: STAGING_DEPLOYMENT,
				topic: STAGING_TOPIC,
				partitionCount: STAGING_PARTITION_COUNT,
				region: STAGING_REGION,
				brokers: STAGING_BROKERS,
				database: {
					hostname: POLICY_HOSTNAME,
					port: POLICY_PORT,
					database: POLICY_DATABASE,
				},
			});
		},
	);

	test.concurrent("validates without mutating the supplied target", () => {
		const target = buildTarget();
		const brokersBefore = [...target.brokers];

		validateReplayStagingTarget({ target, policy: buildPolicy() });

		expect(target.brokers).toEqual(brokersBefore);
		expect(target.databaseUrl).toBe(STAGING_DATABASE_URL);
	});

	test.concurrent(
		"refuses broker sets that are incomplete, extended or altered",
		() => {
			const invalidBrokerSets = [
				STAGING_BROKERS.slice(0, 3),
				[
					...STAGING_BROKERS,
					"b-5.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
				],
				[
					...STAGING_BROKERS.slice(0, 3),
					"b-4.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9092",
				],
				[
					STAGING_BROKERS[0],
					STAGING_BROKERS[0],
					STAGING_BROKERS[1],
					STAGING_BROKERS[2],
				],
				[],
			];

			for (const brokers of invalidBrokerSets) {
				expect(() => validateTarget({ brokers })).toThrow(/broker/i);
			}
		},
	);

	test.concurrent(
		"refuses deployments, topics, partition counts and regions that are not pinned",
		() => {
			const invalidTargets: Record<string, unknown>[] = [
				{ deployment: "tf-balance-prod-v2-512" },
				{ deployment: "tf-balance-staging-v2-256" },
				{ topic: "tf-balance-prod-v2-512-ownership" },
				{ topic: STAGING_DEPLOYMENT },
				{ partitionCount: 256 },
				{ region: "us-west-2" },
			];

			for (const overrides of invalidTargets) {
				expect(() => validateTarget(overrides)).toThrow();
			}
		},
	);

	test.concurrent(
		"refuses production deployments even when the policy matches the database",
		() => {
			const productionHostname = "tf-balance-prod-db.internal";
			const productionDatabase = "balance_prod";

			expect(() =>
				validateReplayStagingTarget({
					target: buildTarget({
						databaseUrl: `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${productionHostname}:5432/${productionDatabase}`,
						deployment: "tf-balance-prod-v2-512",
						topic: "tf-balance-prod-v2-512-ownership",
					}),
					policy: {
						database: {
							hostname: productionHostname,
							port: 5432,
							database: productionDatabase,
						},
					},
				}),
			).toThrow();
		},
	);

	test.concurrent(
		"refuses unknown target fields such as environment hints",
		() => {
			expect(() => validateTarget({ env: "live" })).toThrow();
			expect(() => validateTarget({ trustedStaging: true })).toThrow();
		},
	);

	test.concurrent("refuses incomplete targets and policies", () => {
		const incompleteTargets: Record<string, unknown>[] = [
			{ databaseUrl: undefined },
			{ brokers: undefined },
			{ deployment: undefined },
			{ topic: undefined },
			{ partitionCount: "512" },
			{ region: undefined },
		];

		for (const overrides of incompleteTargets) {
			expect(() => validateTarget(overrides)).toThrow();
		}

		const invalidPolicies: unknown[] = [
			undefined,
			{},
			{ database: { hostname: POLICY_HOSTNAME, port: POLICY_PORT } },
			{
				database: {
					hostname: "",
					port: POLICY_PORT,
					database: POLICY_DATABASE,
				},
			},
			{
				database: {
					hostname: POLICY_HOSTNAME,
					port: 0,
					database: POLICY_DATABASE,
				},
			},
		];

		for (const policy of invalidPolicies) {
			expect(() =>
				validateReplayStagingTarget({ target: buildTarget(), policy }),
			).toThrow();
		}
	});

	test.concurrent(
		"refuses databases outside the policy allowlist, including staging-looking hostnames",
		() => {
			const invalidUrls = [
				`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@other-staging-host.internal:${POLICY_PORT}/${POLICY_DATABASE}`,
				`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:6543/${POLICY_DATABASE}`,
				`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/balance_prod`,
			];

			for (const databaseUrl of invalidUrls) {
				expect(() => validateDatabaseUrl(databaseUrl)).toThrow();
			}
		},
	);

	test.concurrent(
		"accepts the canonical default port and the postgres scheme",
		() => {
			const withDefaultPort = `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}/${POLICY_DATABASE}`;
			const withPostgresScheme = `postgres://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`;

			expect(validateDatabaseUrl(withDefaultPort).database.port).toBe(
				POLICY_PORT,
			);
			expect(validateDatabaseUrl(withPostgresScheme).database.hostname).toBe(
				POLICY_HOSTNAME,
			);
		},
	);

	test.concurrent("refuses unsupported database URL shapes", () => {
		const invalidUrls = [
			`mysql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`,
			`postgresql://${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`,
			`postgresql://:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`,
			`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/`,
			`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}/extra`,
			`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT},replica.internal:${POLICY_PORT}/${POLICY_DATABASE}`,
			`postgresql:///${POLICY_DATABASE}?host=/var/run/postgresql`,
			"not-a-url",
		];

		for (const databaseUrl of invalidUrls) {
			expect(() => validateDatabaseUrl(databaseUrl)).toThrow();
		}
	});

	test.concurrent("refuses database URLs that carry a fragment", () => {
		const withFragment = `${STAGING_DATABASE_URL}#ignored`;

		expect(() => validateDatabaseUrl(withFragment)).toThrow();

		const message = refusalMessageForDatabaseUrl(withFragment);
		expect(message).not.toContain(DATABASE_SECRET);
		expect(message).not.toContain(STAGING_DATABASE_URL);
	});

	test.concurrent(
		"allows only sslmode, application_name and connect_timeout query parameters",
		() => {
			const allowedQuery =
				"sslmode=require&application_name=balance_replay&connect_timeout=5";

			expect(
				validateDatabaseUrl(`${STAGING_DATABASE_URL}?${allowedQuery}`).database
					.database,
			).toBe(POLICY_DATABASE);

			const unsupportedQueries = [
				"sslrootcert=%2Ftmp%2Fca.pem",
				"target_session_attrs=any",
				"SSLMODE=require",
				"Application_Name=balance_replay",
			];

			for (const query of unsupportedQueries) {
				expect(() =>
					validateDatabaseUrl(`${STAGING_DATABASE_URL}?${query}`),
				).toThrow(/query parameter/i);
			}
		},
	);

	test.concurrent(
		"refuses routing query overrides regardless of key casing",
		() => {
			const routingQueries = [
				"host=evil.internal",
				"Host=evil.internal",
				"hostaddr=10.0.0.1",
				"HOSTADDR=10.0.0.1",
				"port=6543",
				"PORT=6543",
				"dbname=balance_prod",
				"DbName=balance_prod",
				"service=prod",
				"servicefile=%2Ftmp%2Fpgservice.conf",
				"options=-c%20search_path%3Dprod",
			];

			for (const query of routingQueries) {
				expect(
					refusalMessageForDatabaseUrl(`${STAGING_DATABASE_URL}?${query}`),
				).toMatch(/routing override/i);
			}
		},
	);

	test.concurrent(
		"keeps credentials and the full URL out of refusal messages",
		() => {
			const messages = [
				refusalMessageForDatabaseUrl(
					`${STAGING_DATABASE_URL}?host=evil.internal`,
				),
				refusalMessageForDatabaseUrl(
					`postgresql://${DATABASE_USER}:${DATABASE_SECRET}@other-host.internal:${POLICY_PORT}/${POLICY_DATABASE}`,
				),
			];

			for (const message of messages) {
				expect(message).not.toContain(DATABASE_SECRET);
				expect(message).not.toContain(DATABASE_USER);
				expect(message).not.toContain(STAGING_DATABASE_URL);
			}
		},
	);
});
