export function resolveServerForkConfig({ value }: { value?: string }) {
	const parsed = Number(value);
	const configured = Number.isInteger(parsed) && parsed >= 1;
	return {
		forkCount: configured ? Math.min(6, parsed) : 4,
		forkCountSource: configured
			? ("environment" as const)
			: ("default" as const),
	};
}
