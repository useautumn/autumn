// const testConfig: Partial<TraceRootConfig> = {
//     service_name: 'test-service',
//     github_owner: 'test-owner',
//     github_repo_name: 'test-repo',
//     github_commit_hash: 'test-commit',
//     environment: 'test',
//     enable_span_cloud_export: false,
//     enable_span_console_export: false,
//     token: 'test-token',
//   };

//   traceroot.init(testConfig);




// import "dotenv/config";

// import * as traceroot from "traceroot-sdk-ts";

// export let tracerootInitialized = false;
// export let tracerootLogger: any = null;

// export async function initializeTraceroot() {
//   if (!tracerootInitialized) {
//     try {
//       // Initialize traceroot (using undici instead of fetch to avoid Next.js instrumentation)
//       await traceroot.init();
//       tracerootLogger = traceroot.get_logger();
//       tracerootInitialized = true;
//       console.log("🚀 Traceroot initialized successfully in API route");
//       if (tracerootLogger) {
//         tracerootLogger.info(
//           "🚀 Traceroot initialized successfully in API route"
//         );
//       }
//     } catch (error) {
//       console.error(
//         "⚠️ Traceroot initialization failed, continuing without tracing:",
//         error
//       );
//       tracerootInitialized = false;
//       tracerootLogger = null;
//       // Don't throw - continue without traceroot
//     }
//   }
// }
