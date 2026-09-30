/** Separate char budgets per stream, so 2,600 workers' boot output can't crowd out run-level or file logs. */
export const createLogBudget = ({
	perWorker,
	perFile,
	run,
}: {
	perWorker: number;
	perFile: number;
	run: number;
}) => {
	const used = new Map<string, number>();
	return {
		take: ({
			file,
			worker,
			chars,
		}: {
			file: string | null;
			worker: string | null;
			chars: number;
		}) => {
			const [key, cap] = file
				? [`f:${file}`, perFile]
				: worker
					? [`w:${worker}`, perWorker]
					: ["run", run];
			const spent = used.get(key) ?? 0;
			if (spent + chars > cap) return false;
			used.set(key, spent + chars);
			return true;
		},
	};
};
