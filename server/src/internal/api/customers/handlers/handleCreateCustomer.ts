import { handleRequestError } from "@/utils/errorUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  CreateCustomer,
  CreateCustomerSchema,
  CustomerResponseSchema,
  ErrCode,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createNewCustomer, getCustomerDetails } from "../cusUtils.js";
import { notNullish } from "@/utils/genUtils.js";

const handleIdIsNull = async ({
  req,
  newCus,
}: {
  req: any;
  newCus: CreateCustomer;
}) => {
  // 1. ID is null
  if (!newCus.email) {
    throw new RecaseError({
      message: "Email is required when `id` is null",
      code: ErrCode.InvalidCustomer,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 2. Check if email already exists
  let existingCustomers = await CusService.getByEmail({
    sb: req.sb,
    email: newCus.email,
    orgId: req.orgId,
    env: req.env,
  });

  if (existingCustomers.length > 0) {
    throw new RecaseError({
      message: `Email ${newCus.email} already exists`,
      code: ErrCode.DuplicateCustomerId,
      statusCode: StatusCodes.CONFLICT,
    });
  }

  const createdCustomer = await createNewCustomer({
    sb: req.sb,
    orgId: req.orgId,
    env: req.env,
    customer: newCus,
    logger: req.logtail,
  });

  return createdCustomer;
};

const handleCreateCustomerWithId = async ({
  req,
  newCus,
}: {
  req: any;
  newCus: CreateCustomer;
}) => {
  // 1. Get by ID
  let existingCustomer = await CusService.getById({
    sb: req.sb,
    id: newCus.id!,
    orgId: req.orgId,
    env: req.env,
    logger: req.logtail,
  });

  if (existingCustomer) {
    return existingCustomer;
  }

  // 2. Check if email exists
  if (notNullish(newCus.email) && newCus.email !== "") {
    let cusWithEmail = await CusService.getByEmail({
      sb: req.sb,
      email: newCus.email!,
      orgId: req.orgId,
      env: req.env,
    });

    if (cusWithEmail.length === 1 && cusWithEmail[0].id === null) {
      // Update customer with ID
      let updatedCustomer = await CusService.update({
        sb: req.sb,
        internalCusId: cusWithEmail[0].internal_id,
        update: {
          id: newCus.id!,
          name: newCus.name,
          fingerprint: newCus.fingerprint,
        },
      });

      return updatedCustomer;
    }
  }

  // 2. Handle email step...
  return await createNewCustomer({
    sb: req.sb,
    orgId: req.orgId,
    env: req.env,
    customer: newCus,
    logger: req.logtail,
  });
};

export const handleCreateCustomer = async (req: any, res: any) => {
  const logger = req.logtail;
  try {
    const data = req.body;

    const newCus = CreateCustomerSchema.parse(data);

    // 1. If no ID and email is not NULL
    let createdCustomer;
    if (newCus.id === null) {
      createdCustomer = await handleIdIsNull({ req, newCus });
    } else {
      createdCustomer = await handleCreateCustomerWithId({ req, newCus });
    }

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer: createdCustomer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      params: req.query,
      logger,
    });

    res.status(200).json({
      customer: CustomerResponseSchema.parse(createdCustomer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices,
      success: true,
    });
  } catch (error: any) {
    if (
      error instanceof RecaseError &&
      error.code === ErrCode.DuplicateCustomerId
    ) {
      logger.warn(
        `POST /customers: ${error.message} (org: ${req.minOrg.slug})`
      );
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }
    handleRequestError({ req, error, res, action: "create customer" });
  }
};
