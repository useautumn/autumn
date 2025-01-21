// worker.js

import { parentPort, workerData } from "worker_threads";
import recase from "recaseai";

const main = async () => {
  console.log("Worker thread started for:", workerData.runId);
  console.log("--------------------------------");

  const { userId, runId, workflow, inputs, scriptPath } = workerData;

  let workflowFunc;
  try {
    const module = await import(scriptPath);
    workflowFunc = module.default;
  } catch (error) {
    console.log("Error importing workflow:", error);
    parentPort?.postMessage({ success: false, error: "Failed to import workflow" });
    return;
  }

  try {
    let logs = await recase._withContext(userId, runId, async () => {
      try {
        await workflowFunc.run({
          id: runId,
          inputs,
        });
      } catch (error) {
        if (error.message) {
          recase.log(error.message);
        } else {
          recase.log(error);
        }
      }

      return recase._getLogs();
    });
    
    console.log("--------------------------------");
    console.log("Workflow thread completed!");

    parentPort?.postMessage({
      success: true,
      logs: {
        name: "root",
        logs,
      },
    });
  } catch (error) {
    console.log("Error running workflow:", error);
    parentPort?.postMessage({
      success: false,
      error: "Failed to run workflow. Error: " + error?.message || error,
    });
  }
};
main();
