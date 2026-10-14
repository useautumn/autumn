import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import { initDrizzle } from "@/db/initDrizzle.js";

assertNotProductionDb();

const CONCURRENCY = 50;
const CPU_ROWS = 50_000_000;

let running = true;
let burnCount = 0;

process.on("SIGTERM", () => {
	running = false;
});
process.on("SIGINT", () => {
	running = false;
});

const { db, client } = initDrizzle({ maxConnections: CONCURRENCY });

try {
	await db.execute(sql`SELECT 1`);
	console.log(
		`[cpuFloodWorker] Connected via PgBouncer, starting ${CONCURRENCY} concurrent burns`,
	);
} catch (err) {
	console.error(`[cpuFloodWorker] Failed to connect: ${err}`);
	process.exit(1);
}

const burn = async () => {
	while (running) {
		try {
			await db.execute(
				sql`SELECT count(*) FROM generate_series(1, ${CPU_ROWS}) AS s WHERE md5(s::text) IS NOT NULL`,
			);
			burnCount++;
		} catch {
			burnCount++;
		}
	}
};

const logInterval = setInterval(() => {
	if (running) {
		console.log(
			`[cpuFloodWorker] ${burnCount} burns completed/timed-out so far`,
		);
	}
}, 5_000);

const promises: Promise<void>[] = [];
for (let i = 0; i < CONCURRENCY; i++) {
	promises.push(burn());
}

await Promise.all(promises);
clearInterval(logInterval);
await client.end();
console.log(`[cpuFloodWorker] Stopped (${burnCount} total burns)`);
