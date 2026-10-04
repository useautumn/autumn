import { dlopen, FFIType, ptr } from "bun:ffi";

/** glibc's gettid and sched_setaffinity, for naming this thread in /proc and pinning it to a CPU set. */
const libc = dlopen("libc.so.6", {
	gettid: { args: [], returns: FFIType.i32 },
	sched_setaffinity: {
		args: [FFIType.i32, FFIType.u64, FFIType.ptr],
		returns: FFIType.i32,
	},
	sched_getcpu: { args: [], returns: FFIType.i32 },
});

export function threadId(): number {
	return libc.symbols.gettid();
}

export function currentCpu(): number {
	return libc.symbols.sched_getcpu();
}

/** Pins the calling thread to `cpus` (Linux CPU numbers). Returns false if the kernel refused. */
export function pinThread({ cpus }: { cpus: number[] }): boolean {
	if (cpus.length === 0) return true;
	const mask = new Uint8Array(128);
	for (const cpu of cpus) mask[cpu >> 3] |= 1 << (cpu & 7);
	return libc.symbols.sched_setaffinity(0, BigInt(mask.length), ptr(mask)) === 0;
}

/** `PIN_<ROLE>=2,3` env vars name a CPU set per role; unset means inherit the process affinity (taskset). */
export function pinFromEnv({ role, index }: { role: string; index?: number }): number[] | null {
	const spec =
		(index !== undefined ? process.env[`PIN_${role.toUpperCase()}${index}`] : undefined) ??
		process.env[`PIN_${role.toUpperCase()}`];
	if (!spec) return null;
	const cpus = spec
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map(Number);
	pinThread({ cpus });
	return cpus;
}
