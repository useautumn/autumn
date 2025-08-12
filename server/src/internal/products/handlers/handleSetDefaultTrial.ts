import { routeHandler } from "@/utils/routerUtils.js";
import { ProductService } from "../ProductService.js";
import { FreeTrialService } from "../free-trials/FreeTrialService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { isFreeProduct } from "../productUtils.js";

export function handleSetDefaultTrial(req: any, res: any) {
  routeHandler({
    req,
    res,
    action: "update default trial setting",
    handler: async () => {
      const { productId } = req.params;
      const { is_default_trial } = req.body;

      const [fullProduct, products] = await Promise.all([
        ProductService.getFull({
          db: req.db,
          idOrInternalId: productId,
          orgId: req.orgId,
          env: req.env,
        }),
        ProductService.listFull({
          db: req.db,
          orgId: req.orgId,
          env: req.env,
          excludeEnts: true,
          returnAll: true,
        })
      ]);

      const freeTrials = await FreeTrialService.list({
        db: req.db,
        productIds: products.map((product) => product.internal_id),
        isDefaultTrial: true
      });

      if(!fullProduct) {
        throw new RecaseError({
          message: "Product not found",
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      if(!fullProduct.free_trial) {
        throw new RecaseError({
          message: "Product does not have a free trial",
          code: ErrCode.InvalidProduct,
          statusCode: 400,
        });
      }

      if(freeTrials.count > 1) {
        throw new RecaseError({
          message: "Cannot set default trial when there is already a default trial",
          code: ErrCode.InvalidProduct,
          statusCode: 400,
        });
      } else if (freeTrials.count === 1 && freeTrials.ids.includes(fullProduct.internal_id)) {
        await FreeTrialService.update({
          db: req.db,
          freeTrialId: fullProduct.free_trial.id,
          update: {
            is_default_trial: is_default_trial,
          },
        });
        
        return res.status(200).send({
          message: "Default trial setting updated",
        });
      }

      if(fullProduct.free_trial?.is_default_trial !== is_default_trial) {
        if(is_default_trial) {
          if(isFreeProduct(fullProduct.prices)) {
            throw new RecaseError({
              message: "Cannot set default trial on a free product",
              code: ErrCode.InvalidProduct,
              statusCode: 400,
            });
          } else if(fullProduct.free_trial.card_required) {
            throw new RecaseError({
              message: "Cannot set default trial on a product where a card is required",
              code: ErrCode.InvalidProduct,
              statusCode: 400,
            });
          } else {
            await FreeTrialService.update({
              db: req.db,
              freeTrialId: fullProduct.free_trial.id,
              update: {
                is_default_trial: true,
              },
            });

            return res.status(200).send({
              message: "Default trial setting updated",
            });
          }
        } else {
          await FreeTrialService.update({
            db: req.db,
            freeTrialId: fullProduct.free_trial.id,
            update: {
              is_default_trial: false,
            },
          });

          return res.status(200).send({
            message: "Default trial setting updated",
          });
        }
      } else return res.status(200).send({
        message: "Default trial setting updated",
      });
    },
  });
}