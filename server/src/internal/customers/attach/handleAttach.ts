import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AttachBodySchema } from "@autumn/shared";
import { getAttachParams } from "./attachUtils/attachParams/getAttachParams.js";
import { getAttachBranch } from "./attachUtils/getAttachBranch.js";
import { getAttachConfig } from "./attachUtils/getAttachConfig.js";
import { handleAttachErrors } from "./attachUtils/handleAttachErrors.js";
import { checkStripeConnections } from "./attachRouter.js";
import { insertCustomItems } from "./attachUtils/insertCustomItems.js";
import { runAttachFunction } from "./attachUtils/getAttachFunction.js";


// import { tracerootInitialized } from "@/external/traceroot/tracerootUtils.js";
import * as traceroot from "traceroot-sdk-ts";
const tracerModule = require("traceroot-sdk-ts/dist/tracer");

const runAttachWithTraceroot = async ({
  function: functionToTrace,
  spanName,
}: {
  function: any;
  spanName: string;
}): Promise<any> => {
  // console.log("super debug ! tracerootInitialized", tracerootInitialized);
  // if (tracerootInitialized) {
  const tracedFunction = traceroot.traceFunction(functionToTrace, {
    spanName: spanName,
  });

  return await tracedFunction();
  // } else {
  //   return await functionToTrace();
  // }
};


export const handleAttach = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      await handleAttachRaceCondition({ req, res });

      const tracedFunction = traceroot.traceFunction(async () => {
        await runAttachWithTraceroot({
          function: async () => {
          const attachBody = AttachBodySchema.parse(req.body);

          const { attachParams, customPrices, customEnts } =
            await getAttachParams({
              req,
              attachBody,
            });

          let traceRootConfig = tracerModule.getConfig()

          // const new_config = traceroot.getConfig();
          // // const logger = getLogger();
        
          // // if (config) {
          //   // logger.info('Service Configuration', {
          // console.log('Service Configuration', {
          //   service_name: config.service_name,
          //   environment: config.environment,
          //   log_level: config.log_level,
          //   enable_log_console_export: config.enable_log_console_export,
          //   enable_log_cloud_export: config.enable_log_cloud_export,
          //   local_mode: config.local_mode
          // });
          // }

          console.log(traceRootConfig.service_name);
          console.log(traceRootConfig.environment);
          console.log(traceRootConfig.log_level);
          console.log(traceRootConfig.enable_log_console_export);
          console.log(traceRootConfig.enable_log_cloud_export);
          console.log(traceRootConfig.local_mode);
          const traceRootLogger = traceroot.getLogger("handleAttach");
          traceRootLogger.info("let me test it first");

          // Handle existing product
          const branch = await getAttachBranch({
            req,
            attachBody,
            attachParams,
          });

          const { flags, config } = await getAttachConfig({
            req,
            attachParams,
            attachBody,
            branch,
          });

          await handleAttachErrors({
            attachParams,
            attachBody,
            branch,
            flags,
            config,
          });

          await checkStripeConnections({
            req,
            attachParams,
            useCheckout: config.onlyCheckout,
          });

          await insertCustomItems({
            db: req.db,
            customPrices: customPrices || [],
            customEnts: customEnts || [],
          });

          try {
            req.logger.info(`Attach params: `, {
              data: {
                products: attachParams.products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  processor: p.processor,
                  version: p.version,
                })),
                prices: attachParams.prices.map((p) => ({
                  id: p.id,
                  config: p.config,
                })),
                entitlements: attachParams.entitlements.map((e) => ({
                  internal_feature_id: e.internal_feature_id,
                  feature_id: e.feature_id,
                })),
                freeTrial: attachParams.freeTrial,
              },
            });
          } catch (error) {}

          await runAttachFunction({
            req,
            res,
            attachParams,
            branch,
            attachBody,
            config,
          });
        },
        spanName: "handleAttach",
      });
      }, { spanName: 'handleAttach.main' });
      
      return await tracedFunction();
    },
  });
