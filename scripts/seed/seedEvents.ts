import {
	AppEnv,
	ErrCode,
	type EventInsert,
	organizations,
	RecaseError,
} from "@autumn/shared";
import { type DrizzleCli, initDrizzle } from "@server/db/initDrizzle.js";
import { EventService } from "@server/internal/api/events/EventService.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { generateId } from "@server/utils/genUtils.js";
import chalk from "chalk";

// Load environment variables from server/.env
loadLocalEnv();

// ============================================================================
// CONFIGURATION - Edit these values to customize seed behavior
// ============================================================================

const CONFIG = {
	// Default number of events to generate
	defaultEventCount: 100,

	// Time range configuration (in days)
	// Events will be randomly distributed within this range from now
	timeRangeDays: 30,

	// Default environment
	defaultEnv: AppEnv.Sandbox,

	// Optional default properties to include in events
	defaultProperties: {
		source: "seed_script",
		version: "1.0",
	},
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface CliArgs {
	customer_id: string;
	org_slug: string;
	count?: number;
	env?: AppEnv;
	feature_ids: string;
}

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const parsed: Partial<CliArgs> = {};

	for (const arg of args) {
		if (arg.startsWith("--")) {
			const [key, value] = arg.slice(2).split("=");
			if (key === "customer_id") {
				parsed.customer_id = value;
			} else if (key === "org_slug") {
				parsed.org_slug = value;
			} else if (key === "count") {
				parsed.count = Number.parseInt(value, 10);
			} else if (key === "env") {
				parsed.env = value as AppEnv;
			} else if (key === "feature_ids") {
				parsed.feature_ids = value;
			}
		}
	}

	if (!parsed.customer_id) {
		console.error(chalk.red("❌ Error: --customer_id is required"));
		console.log(
			chalk.yellow(
				"\nUsage: bun run scripts/seed/seedEvents.ts --customer_id=<id> --org_slug=<slug> --feature_ids=<id1,id2,id3> [--count=<number>] [--env=<sandbox|live>]",
			),
		);
		console.log(chalk.gray("\nExample:"));
		console.log(
			chalk.gray(
				"  bun run scripts/seed/seedEvents.ts --customer_id=cus_123 --org_slug=my-org --feature_ids=api_call,page_view --count=50 --env=sandbox",
			),
		);
		process.exit(1);
	}

	if (!parsed.org_slug) {
		console.error(chalk.red("❌ Error: --org_slug is required"));
		console.log(
			chalk.yellow(
				"\nUsage: bun run scripts/seed/seedEvents.ts --customer_id=<id> --org_slug=<slug> --feature_ids=<id1,id2,id3> [--count=<number>] [--env=<sandbox|live>]",
			),
		);
		console.log(chalk.gray("\nExample:"));
		console.log(
			chalk.gray(
				"  bun run scripts/seed/seedEvents.ts --customer_id=cus_123 --org_slug=my-org --feature_ids=api_call,page_view --count=50 --env=sandbox",
			),
		);
		process.exit(1);
	}

	if (!parsed.feature_ids) {
		console.error(chalk.red("❌ Error: --feature_ids is required"));
		console.log(
			chalk.yellow(
				"\nUsage: bun run scripts/seed/seedEvents.ts --customer_id=<id> --org_slug=<slug> --feature_ids=<id1,id2,id3> [--count=<number>] [--env=<sandbox|live>]",
			),
		);
		console.log(chalk.gray("\nExample:"));
		console.log(
			chalk.gray(
				"  bun run scripts/seed/seedEvents.ts --customer_id=cus_123 --org_slug=my-org --feature_ids=api_call,page_view --count=50 --env=sandbox",
			),
		);
		process.exit(1);
	}

	return parsed as CliArgs;
}

// ============================================================================
// VALIDATION
// ============================================================================

async function validateOrg({
	db,
	orgSlug,
}: {
	db: DrizzleCli;
	orgSlug: string;
}) {
	const org = await db.query.organizations.findFirst({
		where: (orgs, { eq }) => eq(orgs.slug, orgSlug),
	});

	if (!org) {
		throw new RecaseError({
			message: `Organization with slug '${orgSlug}' not found`,
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}

	return org;
}

async function validateCustomer({
	db,
	customerId,
	orgId,
	env,
}: {
	db: DrizzleCli;
	customerId: string;
	orgId: string;
	env: AppEnv;
}) {
	const customer = await db.query.customers.findFirst({
		where: (customers, { eq, or, and }) => {
			return and(
				or(eq(customers.id, customerId), eq(customers.internal_id, customerId)),
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			);
		},
	});

	if (!customer) {
		throw new RecaseError({
			message: `Customer '${customerId}' not found in org '${orgId}' with env '${env}'`,
			code: ErrCode.CustomerNotFound,
			statusCode: 404,
		});
	}

	return customer;
}

// ============================================================================
// EVENT GENERATION
// ============================================================================

function generateRandomTimestamp({ daysBack }: { daysBack: number }): Date {
	const now = Date.now();
	const startTime = now - daysBack * 24 * 60 * 60 * 1000;
	const randomTime = startTime + Math.random() * (now - startTime);
	return new Date(randomTime);
}

function generateEvents({
	count,
	customer,
	org,
	env,
	featureIds,
}: {
	count: number;
	customer: Awaited<ReturnType<typeof validateCustomer>>;
	org: Awaited<ReturnType<typeof validateOrg>>;
	env: AppEnv;
	featureIds: string[];
}): EventInsert[] {
	const events: EventInsert[] = [];

	for (let i = 0; i < count; i++) {
		const eventName = featureIds[Math.floor(Math.random() * featureIds.length)];
		const timestamp = generateRandomTimestamp({
			daysBack: CONFIG.timeRangeDays,
		});

		const event: EventInsert = {
			id: generateId("evt"),
			org_id: org.id,
			org_slug: org.slug,
			internal_customer_id: customer.internal_id,
			customer_id: customer.id || "",
			env,
			event_name: eventName,
			timestamp,
			created_at: Date.now(),
			value: null,
			set_usage: false,
			entity_id: null,
			internal_entity_id: null,
			idempotency_key: null,
			properties: {
				...CONFIG.defaultProperties,
				event_index: i + 1,
				random_value: Math.floor(Math.random() * 1000),
				user: {
					id: Math.floor(Math.random() * 10) + 1,
				},
			},
		};

		events.push(event);
	}

	// Sort events by timestamp for more realistic insertion
	events.sort(
		(a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0),
	);

	return events;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
	console.log(
		chalk.magentaBright(
			"\n================ Event Seeding Script ================\n",
		),
	);

	// Parse CLI arguments
	const args = parseArgs();
	const eventCount = args.count || CONFIG.defaultEventCount;
	const env = args.env || CONFIG.defaultEnv;
	const featureIds = args.feature_ids.split(",").map((id) => id.trim());

	console.log(chalk.cyan("Configuration:"));
	console.log(chalk.gray(`  Customer ID: ${args.customer_id}`));
	console.log(chalk.gray(`  Organization Slug: ${args.org_slug}`));
	console.log(chalk.gray(`  Event Count: ${eventCount}`));
	console.log(chalk.gray(`  Environment: ${env}`));
	console.log(chalk.gray(`  Feature IDs: ${featureIds.join(", ")}`));
	console.log();

	// Initialize database connection
	const { db, client } = initDrizzle();

	try {
		// Validate organization exists
		console.log(chalk.cyan("Validating organization..."));
		const org = await validateOrg({
			db,
			orgSlug: args.org_slug,
		});

		console.log(
			chalk.green(`✅ Organization found: ${org.slug} (${org.name})`),
		);
		console.log();

		// Validate customer exists
		console.log(chalk.cyan("Validating customer..."));
		const customer = await validateCustomer({
			db,
			customerId: args.customer_id,
			orgId: org.id,
			env,
		});

		console.log(
			chalk.green(
				`✅ Customer found: ${customer.id} (${customer.name || "No name"})`,
			),
		);
		console.log();

		// Generate events
		console.log(chalk.cyan(`Generating ${eventCount} events...`));
		const events = generateEvents({
			count: eventCount,
			customer,
			org,
			env,
			featureIds,
		});

		console.log(chalk.green(`✅ Generated ${events.length} events`));
		console.log(
			chalk.gray(
				`   Time range: ${events[0].timestamp?.toISOString()} to ${events[events.length - 1].timestamp?.toISOString()}`,
			),
		);
		console.log(
			chalk.gray(
				`   Event types: ${Array.from(new Set(events.map((e) => e.event_name))).join(", ")}`,
			),
		);
		console.log();

		// Insert events
		console.log(chalk.cyan("Inserting events into database..."));
		let successCount = 0;
		let errorCount = 0;

		// Insert in batches to avoid overwhelming the database
		const batchSize = 50;
		for (let i = 0; i < events.length; i += batchSize) {
			const batch = events.slice(i, i + batchSize);
			const batchNum = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(events.length / batchSize);

			process.stdout.write(
				chalk.gray(`   Batch ${batchNum}/${totalBatches}... `),
			);

			for (const event of batch) {
				try {
					await EventService.insert({ db, event });
					successCount++;
				} catch (error) {
					errorCount++;
					if (errorCount <= 5) {
						// Only show first 5 errors to avoid spam
						console.log(
							chalk.yellow(
								`\n   ⚠️  Error inserting event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
							),
						);
					}
				}
			}

			console.log(chalk.green("✓"));
		}

		console.log();
		console.log(chalk.green(`✅ Successfully inserted ${successCount} events`));

		if (errorCount > 0) {
			console.log(chalk.yellow(`⚠️  ${errorCount} events failed to insert`));
			if (errorCount > 5) {
				console.log(
					chalk.gray(`   (Only first 5 errors shown to reduce spam)`),
				);
			}
		}

		console.log(
			chalk.magentaBright(
				"\n================ Seeding Complete ================\n",
			),
		);
	} catch (error) {
		console.error(chalk.red("\n❌ Error during seeding:"));
		if (error instanceof RecaseError) {
			console.error(chalk.red(`   ${error.message}`));
		} else if (error instanceof Error) {
			console.error(chalk.red(`   ${error.message}`));
			console.error(chalk.gray(error.stack));
		} else {
			console.error(chalk.red(`   ${String(error)}`));
		}
		process.exit(1);
	} finally {
		await client.end();
	}
}

// Run the script
main();
