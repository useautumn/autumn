import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CreateCustomerSchema, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../getCustomerDetails.js";

export const handleUpdateCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "POST/customers/:customer_id",
    handler: async (req, res) => {
      const customerId = req.params.customer_id;
      const [originalCustomer, org] = await Promise.all([
        CusService.getByIdOrInternalId({
          sb: req.sb,
          idOrInternalId: customerId,
          orgId: req.orgId,
          env: req.env,
        }),
        OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId }),
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
        const existingCustomer = await CusService.getById({
          sb: req.sb,
          id: newCusData.id,
          orgId: req.orgId,
          env: req.env,
          logger: req.logtail,
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
          stripeUpdate as any
        );
      }

      const updatedCustomer = await CusService.update({
        sb: req.sb,
        internalCusId: originalCustomer.internal_id,
        update: newCusData,
      });

      // res.status(200).json({ customer: updatedCustomer });
      let customerDetails = await getCustomerDetails({
        sb: req.sb,
        customer: updatedCustomer,
        orgId: req.orgId,
        env: req.env,
        logger: req.logtail,
      });

      res.status(200).json(customerDetails);
    },
  });
