import { QueueManager } from "./queue/QueueManager.js";
import { initWorkers } from "./queue/workersInit.js";

const init = async () => {
	await QueueManager.getInstance(); // initialize the queue manager
	await initWorkers();
};

init();
