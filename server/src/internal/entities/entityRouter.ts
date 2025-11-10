import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCreateEntity } from "./handlers/handleCreateEntity/handleCreateEntity2.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity/handleDeleteEntity.js";
import { handleGetEntity } from "./handlers/handleGetEntity.js";
import { handleListEntities } from "./handlers/handleListEntities.js";

export const entityRouter = new Hono<HonoEnv>();

entityRouter.post("/customers/:customer_id/entities", ...handleCreateEntity);

entityRouter.get(
	"/customers/:customer_id/entities/:entity_id",
	...handleGetEntity,
);

entityRouter.delete(
	"/customers/:customer_id/entities/:entity_id",
	...handleDeleteEntity,
);

entityRouter.get("/customers/:customer_id/entities", ...handleListEntities);
// entityRouter.post("", ...handlePostEntityRequest);
// entityRouter.delete("/:entity_id", ...handleDeleteEntity);
