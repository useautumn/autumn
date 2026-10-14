const FAILED_RESULTS = ["failure", "cancelled"];

export type PublishAlert = {
	runUrl: string;
	failedJobs: string[];
	unknownFiles: string[];
};

/** What #shipped should hear about a Publish run; null when it needs no attention. */
export const buildPublishAlert = ({
	needs,
	unknownFiles,
	runUrl,
}: {
	needs: Record<string, { result?: string }>;
	unknownFiles: string;
	runUrl: string;
}): PublishAlert | null => {
	const failedJobs = Object.entries(needs)
		.filter(([, job]) => FAILED_RESULTS.includes(job.result ?? ""))
		.map(([name]) => name);
	const unknown = unknownFiles.split(",").filter(Boolean);
	if (failedJobs.length === 0 && unknown.length === 0) return null;
	return { runUrl, failedJobs, unknownFiles: unknown };
};

// Usage: NEEDS=<toJSON(needs)> UNKNOWN_FILES=a,b RUN_URL=… bun publishAlert.ts. Prints the payload or nothing.
if (import.meta.main) {
	try {
		const alert = buildPublishAlert({
			needs: JSON.parse(process.env.NEEDS ?? "{}"),
			unknownFiles: process.env.UNKNOWN_FILES ?? "",
			runUrl: process.env.RUN_URL ?? "",
		});
		if (alert) console.log(JSON.stringify(alert));
	} catch (error) {
		console.error(`::warning::Couldn't build the Publish alert: ${error}`);
	}
}
