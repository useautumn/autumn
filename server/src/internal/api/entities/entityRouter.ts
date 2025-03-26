import { Router } from "express";
import { handleCreateEntity } from "./handleCreateEntity.js";

export const entityRouter = Router();

// 1. Create entity
entityRouter.post("", handleCreateEntity);
