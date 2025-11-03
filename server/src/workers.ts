// Suppress BullMQ eviction policy warnings BEFORE any imports
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
	const msg = args.join(" ");
	if (msg.includes("Eviction policy")) {
		return;
	}
	originalWarn.apply(console, args);
};

import { initWorkers } from "./queue/initWorkers.js";

await initWorkers();
