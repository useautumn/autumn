import { createClient } from "@libsql/client";
import { dbToken, dbUrl } from "./config";
import { customerIdOf, subjectRow, upsertSubjectsSql } from "./schema";

const db = process.argv[2]!;
const url = dbUrl({ db }).replace("libsql://", "https://");
const authToken = dbToken({ db, access: "full" });
const run = async (writers: number, rows: number, secs = 8) => {
	const cs = Array.from({ length: writers }, () =>
		createClient({ url, authToken }),
	);
	await Promise.all(cs.map((c) => c.execute("SELECT 1")));
	const lat: number[] = [];
	let n = 0,
		errs = 0;
	let firstErr = "";
	const t0 = performance.now();
	await Promise.all(
		cs.map(async (c, k) => {
			while (performance.now() - t0 < secs * 1000) {
				const base = k * 10000 + Math.floor(Math.random() * 9000);
				const t = performance.now();
				try {
					await c.execute({
						sql: upsertSubjectsSql({ rows }),
						args: Array.from({ length: rows }, (_, j) =>
							subjectRow({
								customerId: customerIdOf(base + j),
								seq: Date.now() * 1000 + j,
								bytes: 6000,
							}),
						).flat() as never,
					});
					n += rows;
					lat.push(performance.now() - t);
				} catch (e) {
					errs++;
					firstErr ||= String(e).slice(0, 160);
				}
			}
		}),
	);
	lat.sort((a, b) => a - b);
	console.log(
		`writers=${writers} rows/stmt=${rows}: ${((n * 1000) / (performance.now() - t0)).toFixed(0)} rows/s, stmt p50 ${lat[lat.length >> 1]?.toFixed(0)} p99 ${lat[Math.floor(lat.length * 0.99)]?.toFixed(0)} ms, errors ${errs} ${firstErr}`,
	);
	cs.forEach((c) => c.close());
};
for (const [w, r] of [
	[1, 1],
	[4, 1],
	[16, 1],
	[1, 50],
	[1, 100],
	[4, 50],
	[8, 50],
])
	await run(w, r);
