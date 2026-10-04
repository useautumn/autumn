import { dlopen, FFIType, ptr } from "bun:ffi";
import { profile } from "bun:jsc";
import type { ServerCpuBackend } from "./types/serverCpuProfile.js";

let backend: ServerCpuBackend | undefined;

export function getServerCpuBackend(): ServerCpuBackend {
	if (backend) return backend;
	if (process.platform !== "linux")
		throw new Error("Server CPU profiling requires Linux thread CPU clocks");
	if (process.execArgv.some((arg) => arg.startsWith("--cpu-prof")))
		throw new Error("Server CPU profiler is already owned by CLI profiling");
	const library = dlopen("libc.so.6", {
		clock_gettime: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
	});
	const time = new BigInt64Array(2);
	const pointer = ptr(time);
	function readThreadCpuNs() {
		if (library.symbols.clock_gettime(3, pointer) !== 0)
			throw new Error("Thread CPU clock failed");
		return Number(time[0]) * 1e9 + Number(time[1]);
	}
	function readProcessCpuUs() {
		const usage = process.cpuUsage();
		return usage.user + usage.system;
	}
	function now() {
		return performance.now();
	}
	function capture(run: () => Promise<void>) {
		return profile(run, 50_000);
	}
	backend = { readThreadCpuNs, readProcessCpuUs, now, capture };
	return backend;
}
