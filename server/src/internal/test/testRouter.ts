import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { Router } from "express";

export const testRouter = Router();

testRouter.post("/warning", (req: any, res) => {
  try {
    req.logger.info("Test info log");
    throw new RecaseError({
      message: "Test Recase Warning",
      code: "test_warning",
      statusCode: 200,
    });
  } catch (error) {
    handleRequestError({
      error,
      req,
      res,
      action: "test_warning",
    });
  }
});

testRouter.post("/error", (req: any, res) => {
  try {
    req.logger.info("Test info log");
    throw new Error("Test unknown error");
  } catch (error) {
    handleRequestError({
      error,
      req,
      res,
      action: "test_error",
    });
  }
});
