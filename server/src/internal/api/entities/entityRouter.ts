import { Router } from "express";
import { handleCreateEntity } from "./handleCreateEntity.js";
import { handleDeleteEntity } from "./handleDeleteEntity.js";

export const entityRouter = Router({ mergeParams: true });

// 1. Create entity
entityRouter.post("", handleCreateEntity);

// 2. Delete entity
entityRouter.delete("/:entity_id", handleDeleteEntity);
