import { Router } from "express";
import { handleBatchCustomers } from "./handlers/handleBatchCustomers.js";

export const batchRouter = Router();

batchRouter.post("/customers", handleBatchCustomers);