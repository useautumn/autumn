const FAILED_RESULTS = ["failure", "cancelled"];

export type PublishAlert = {
	runUrl: string;
	failedJobs: string[];
	unknownFiles: string[];
};

const MAX_ENTRY_LENGTH = 300;

const describeGuardFailure = ({ files }: { files: string[] }) => {
	const prefix =
		"prepare (regenerated files not in .github/generated-paths.txt: ";
	const list = files.join(", ");
	const room = MAX_ENTRY_LENGTH - prefix.length - 1;
	return `${prefix}${list.length <= room ? list : `${list.slice(0, room - 1)}…`})`;
};

/** What #shipped should hear about a failed Publish run; null when every job passed or was skipped. */
export const buildPublishAlert = ({
	needs,
	unknownFiles,
	runUrl,
}: {
	needs: Record<string, { result?: string }>;
	unknownFiles: string;
	runUrl: string;
}): PublishAlert | null => {
	const guardFiles = unknownFiles.split(",").filter(Boolean);
	const failedJobs = Object.entries(needs)
		.filter(([, job]) => FAILED_RESULTS.includes(job.result ?? ""))
		.map(([name]) =>
			name === "prepare" && guardFiles.length > 0
				? describeGuardFailure({ files: guardFiles })
				: name,
		);
	if (failedJobs.length === 0) return null;
	return { runUrl, failedJobs, unknownFiles: [] };
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
