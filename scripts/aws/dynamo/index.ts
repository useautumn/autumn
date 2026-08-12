/**
 * Sets up Autumn's DynamoDB tables (idempotent — safe to re-run).
 *
 * Local emulators auto-create tables on first use (ensureLocalDynamoTable.ts),
 * so this script is mainly for REAL AWS, where the server deliberately never
 * creates tables (no dynamodb:CreateTable IAM for the app).
 *
 * Usage:
 *   bun dynamo setup     # create tables + enable TTL, wait for ACTIVE
 *   bun dynamo status    # describe tables
 *
 * Env:
 *   AWS_REGION                  target region (default us-east-2, the server's)
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   credentials
 *   DYNAMODB_ENDPOINT           optional emulator endpoint (local only)
 *   DYNAMODB_IDEMPOTENCY_TABLE  idempotency table name override
 */

import {
	CreateTableCommand,
	DescribeTableCommand,
	DescribeTimeToLiveCommand,
	DynamoDBClient,
	ResourceInUseException,
	ResourceNotFoundException,
	UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
	getIdempotencyTableName,
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "@server/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.ts";

type TableDefinition = {
	tableName: string;
	partitionKey: string;
	ttlAttribute?: string;
};

/** Every Autumn DynamoDB table — add new tables here. */
const tableDefinitions: TableDefinition[] = [
	{
		tableName: getIdempotencyTableName(),
		partitionKey: IDEMPOTENCY_TABLE_PARTITION_KEY,
		ttlAttribute: IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
	},
];

const DEFAULT_AWS_REGION = "us-east-2";
const ACTIVE_WAIT_ATTEMPTS = 60;
const ACTIVE_WAIT_INTERVAL_MS = 2_000;

const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;
const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;

const log = (message: string) => console.log(`[dynamo] ${message}`);

const client = new DynamoDBClient({
	region,
	...(endpoint ? { endpoint } : {}),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForActive = async ({ tableName }: { tableName: string }) => {
	for (let attempt = 0; attempt < ACTIVE_WAIT_ATTEMPTS; attempt++) {
		const described = await client.send(
			new DescribeTableCommand({ TableName: tableName }),
		);
		if (described.Table?.TableStatus === "ACTIVE") return;
		await sleep(ACTIVE_WAIT_INTERVAL_MS);
	}
	throw new Error(`table ${tableName} did not become ACTIVE`);
};

const ensureTable = async (definition: TableDefinition) => {
	const { tableName, partitionKey, ttlAttribute } = definition;

	try {
		await client.send(
			new CreateTableCommand({
				TableName: tableName,
				AttributeDefinitions: [
					{ AttributeName: partitionKey, AttributeType: "S" },
				],
				KeySchema: [{ AttributeName: partitionKey, KeyType: "HASH" }],
				BillingMode: "PAY_PER_REQUEST",
			}),
		);
		log(`created table ${tableName}`);
	} catch (error) {
		if (!(error instanceof ResourceInUseException)) throw error;
		log(`table ${tableName} already exists`);
	}

	await waitForActive({ tableName });

	if (!ttlAttribute) return;
	const ttl = await client.send(
		new DescribeTimeToLiveCommand({ TableName: tableName }),
	);
	const ttlStatus = ttl.TimeToLiveDescription?.TimeToLiveStatus;
	if (ttlStatus === "ENABLED" || ttlStatus === "ENABLING") {
		log(
			`TTL already ${ttlStatus.toLowerCase()} on ${tableName}.${ttlAttribute}`,
		);
		return;
	}
	// Real AWS allows one UpdateTimeToLive per table per hour and can take up
	// to an hour to enable — hence the check above before calling it.
	await client.send(
		new UpdateTimeToLiveCommand({
			TableName: tableName,
			TimeToLiveSpecification: { AttributeName: ttlAttribute, Enabled: true },
		}),
	);
	log(`enabled TTL on ${tableName}.${ttlAttribute}`);
};

const status = async () => {
	for (const { tableName, ttlAttribute } of tableDefinitions) {
		try {
			const described = await client.send(
				new DescribeTableCommand({ TableName: tableName }),
			);
			const ttl = ttlAttribute
				? await client.send(
						new DescribeTimeToLiveCommand({ TableName: tableName }),
					)
				: undefined;
			log(
				`${tableName}: ${described.Table?.TableStatus}, items=${described.Table?.ItemCount}` +
					(ttl ? `, ttl=${ttl.TimeToLiveDescription?.TimeToLiveStatus}` : ""),
			);
		} catch (error) {
			if (!(error instanceof ResourceNotFoundException)) throw error;
			log(`${tableName}: MISSING`);
		}
	}
};

const setup = async () => {
	for (const definition of tableDefinitions) {
		await ensureTable(definition);
	}
	log("all tables ready");
};

const command = process.argv[2] ?? "setup";
log(`target: ${endpoint ?? `AWS ${region}`}`);

switch (command) {
	case "setup":
		await setup();
		break;
	case "status":
		await status();
		break;
	default:
		console.error(`Unknown command: ${command} (expected setup | status)`);
		process.exit(1);
}
