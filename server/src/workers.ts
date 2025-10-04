// Suppress BullMQ eviction policy warnings BEFORE any imports
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
	const msg = args.join(" ");
	if (msg.includes("Eviction policy")) {
		return;
	}
	originalWarn.apply(console, args);
};

import { QueueManager } from "./queue/QueueManager.js";
import { initWorkers } from "./queue/workersInit.js";

const init = async () => {
	await QueueManager.getInstance(); // initialize the queue manager
	await initWorkers();
};

init();
