// One JSON line to stdout, so an ECS task-log tail (or a script piping
// through `jq`) gets exactly one machine-readable summary per run.
export const printSummary = ({ summary }: { summary: unknown }): void => {
	console.log(JSON.stringify(summary));
};
