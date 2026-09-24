/** Path-style S3 stand-in for the edge config proof: GET/PUT on one bucket,
 *  per-key GET counters, and a switch that answers every GET with a 503. */
export const startFakeS3 = ({
	port,
	bucket,
}: {
	port: number;
	bucket: string;
}) => {
	const objects = new Map<string, string>();
	const getCounts = new Map<string, number>();
	const failedGetCounts = new Map<string, number>();
	const reports = new Map<number, ChildReport & { seenAt: number }>();
	let failing = false;

	const xmlError = ({ status, code }: { status: number; code: string }) =>
		new Response(
			`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`,
			{ status, headers: { "content-type": "application/xml" } },
		);

	const server = Bun.serve({
		port,
		async fetch(request) {
			const { pathname } = new URL(request.url);
			if (pathname === "/__report") {
				const report = (await request.json()) as ChildReport;
				reports.set(report.pid, { ...report, seenAt: Date.now() });
				return new Response("ok");
			}

			const prefix = `/${bucket}/`;
			if (!pathname.startsWith(prefix)) {
				return xmlError({ status: 404, code: "NoSuchBucket" });
			}
			const key = decodeURIComponent(pathname.slice(prefix.length));

			if (request.method === "PUT") {
				objects.set(key, await request.text());
				return new Response("", { status: 200 });
			}
			if (request.method !== "GET") {
				return xmlError({ status: 405, code: "MethodNotAllowed" });
			}

			if (failing) {
				failedGetCounts.set(key, (failedGetCounts.get(key) ?? 0) + 1);
				return xmlError({ status: 503, code: "SlowDown" });
			}
			getCounts.set(key, (getCounts.get(key) ?? 0) + 1);
			const body = objects.get(key);
			if (body === undefined)
				return xmlError({ status: 404, code: "NoSuchKey" });
			return new Response(body, {
				headers: { "content-type": "application/json" },
			});
		},
	});

	return {
		endpoint: `http://127.0.0.1:${server.port}`,
		/** Writes straight into the bucket: no S3 request, no signal. */
		putObject: ({ key, body }: { key: string; body: string }) =>
			objects.set(key, body),
		setFailing: (value: boolean) => {
			failing = value;
		},
		snapshotGets: () => ({
			ok: new Map(getCounts),
			failed: new Map(failedGetCounts),
		}),
		/** Latest report per live child (reported within `maxAgeMs`). */
		liveReports: ({ maxAgeMs = 400 }: { maxAgeMs?: number } = {}) =>
			[...reports.values()].filter(
				(report) => Date.now() - report.seenAt <= maxAgeMs,
			),
		reset: () => {
			objects.clear();
			getCounts.clear();
			failedGetCounts.clear();
			reports.clear();
			failing = false;
		},
		stop: () => server.stop(true),
	};
};

export type FakeS3 = ReturnType<typeof startFakeS3>;

export type ChildReport = {
	pid: number;
	workerId: number;
	probe: string;
	probeHealthy: boolean;
	slot: string | null;
	slotHealthy: boolean;
};
