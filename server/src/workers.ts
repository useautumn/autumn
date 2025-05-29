import { initWorkers } from "./queue/workers.js";
import { QueueManager } from "./queue/QueueManager.js";

const init = async () => {
  await QueueManager.getInstance(); // initialize the queue manager
  await initWorkers();
};

init();
