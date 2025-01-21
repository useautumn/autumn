// import { Job } from "bullmq";
// import path from "path";
// import ksuid from "ksuid";
// import fs from "fs";
// import { Worker } from "worker_threads";
// import { fileURLToPath } from "url";
// import { getSecret } from "src/external/awsSecrets";
// import { WorkflowManager } from "./WorkflowManager";

// // Run workflow
// export const runWorkflow = async (job: Job) => {
//   const manager = new WorkflowManager();
//   await manager.runWorkflow(job);
//   return;
//   const { workflow, inputs } = job.data;

//   console.log("Running workflow:", job.data.workflow.external_id);
//   console.log("Workflow env:", workflow.env);

//   let env = {};
//   if (workflow.env) {
//     try {
//       let envStr = await getSecret(workflow.env);
//       if (envStr) {
//         env = JSON.parse(envStr);
//       }
//     } catch (error) {}
//   }

//   let runId = `run_${ksuid.randomSync().string}`;

//   let tmpPath = path.join(
//     process.cwd(),
//     "src",
//     "workflow-scripts",
//     `${runId}.ts`
//   );

//   fs.writeFileSync(tmpPath, workflow.file_contents);
//   let module = await import(tmpPath);
//   let workflowFunc = module.default;

//   const workerPath = path.resolve(process.cwd(), "src/queue/worker.ts");
//   const workerUrl = fileURLToPath(new URL(workerPath, import.meta.url));

//   const worker = new Worker(workerUrl, {
//     workerData: { runId, inputs, workflow },
//     env,
//     execArgv: [
//       "--no-deprecation",
//       "--import",
//       "data:text/javascript,import { register } from 'node:module'; import { pathToFileURL } from 'node:url'; register('ts-node/esm', pathToFileURL('./'));",
//     ],
//   });

//   worker.on("message", (message) => {
//     if (message.success) {
//       console.log("Workflow run completed successfully!");
//       // console.log("Logs:", message.logs);
//     } else {
//       console.error("Workflow run failed:", message.error);
//     }
//   });

//   fs.rmSync(tmpPath);
// };

// // const step = ({ name, callback }: { name: string; callback: any }) => {
// //   return {
// //     name,
// //     run: async () => {
// //       logger.newLevel(name);
// //       await callback();
// //       logger.finishLevel();
// //     },
// //   };
// // };
