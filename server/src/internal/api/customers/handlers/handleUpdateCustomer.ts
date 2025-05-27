import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CreateCustomerSchema, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../getCustomerDetails.js";
import { parseCusExpand } from "../cusUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

export const handleUpdateCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "POST/customers/:customer_id",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { orgId, env, db, org } = req;
      const customerId = req.params.customer_id;
      const [originalCustomer, features] = await Promise.all([
        CusService.get({
          db,
          idOrInternalId: customerId,
          orgId,
          env,
        }),

        FeatureService.getFromReq(req),
      ]);

      if (!originalCustomer) {
        throw new RecaseError({
          message: `Update customer: Customer ${customerId} not found`,
          code: ErrCode.CustomerNotFound,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }

      let newCusData: any = CreateCustomerSchema.parse(req.body);

      if (req.body.id === null) {
        throw new RecaseError({
          message: `Update customer: Can't change customer ID to null`,
          code: ErrCode.InvalidUpdateCustomerParams,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (notNullish(newCusData.id) && originalCustomer.id !== newCusData.id) {
        // Fetch for existing customer
        const existingCustomer = await CusService.get({
          db: req.db,
          idOrInternalId: newCusData.id,
          orgId: req.orgId,
          env: req.env,
        });

        if (existingCustomer) {
          throw new RecaseError({
            message: `Update customer: Customer ${newCusData.id} already exists, can't change to this ID`,
            code: ErrCode.DuplicateCustomerId,
            statusCode: StatusCodes.CONFLICT,
          });
        }
      } else {
        delete newCusData.id;
      }

      // 2. Check if customer email is being changed
      let oldMetadata = originalCustomer.metadata || {};
      let newMetadata = newCusData.metadata || {};
      for (let key in newMetadata) {
        if (newMetadata[key] === null) {
          delete newMetadata[key];
          delete oldMetadata[key];
        }
      }

      let stripeUpdate = {
        email:
          originalCustomer.email !== newCusData.email
            ? newCusData.email
            : undefined,
        name:
          originalCustomer.name !== newCusData.name
            ? newCusData.name
            : undefined,
      };

      if (
        Object.keys(stripeUpdate).length > 0 &&
        originalCustomer.processor?.id
      ) {
        const stripeCli = createStripeCli({ org, env: req.env });
        await stripeCli.customers.update(
          originalCustomer.processor.id,
          stripeUpdate as any,
        );
      }

      await CusService.update({
        db: req.db,
        internalCusId: originalCustomer.internal_id,
        update: {
          ...newCusData,
          metadata: {
            ...oldMetadata,
            ...newMetadata,
          },
        },
      });

      let finalCustomer = await CusService.getFull({
        db,
        idOrInternalId: originalCustomer.internal_id,
        orgId: req.orgId,
        env: req.env,
        withEntities: true,
      });

      // res.status(200).json({ customer: updatedCustomer });
      let customerDetails = await getCustomerDetails({
        db,
        customer: finalCustomer,
        org,
        env: req.env,
        logger: req.logtail,
        cusProducts: finalCustomer.customer_products,
        expand: parseCusExpand(req.query.expand as string),
        features,
        reqApiVersion: req.apiVersion,
      });

      res.status(200).json(customerDetails);
    },
  });
