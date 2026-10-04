export function summarizeProcessCpuWindow({
	previous,
	current,
	windowMs,
}: {
	previous: NodeJS.CpuUsage;
	current: NodeJS.CpuUsage;
	windowMs: number;
}) {
	const cpuUserMs = Math.round(current.user - previous.user) / 1000;
	const cpuSystemMs = Math.round(current.system - previous.system) / 1000;
	const cpuMs =
		Math.round(
			current.user + current.system - previous.user - previous.system,
		) / 1000;
	const cpuCoreEquivalents =
		Number.isFinite(windowMs) && windowMs > 0 ? cpuMs / windowMs : 0;
	return {
		cpuMs,
		cpuUserMs,
		cpuSystemMs,
		cpuPct: Math.round(cpuCoreEquivalents * 10000) / 100,
		cpuCoreEquivalents: Math.round(cpuCoreEquivalents * 1e6) / 1e6,
	};
}
