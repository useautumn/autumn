import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCreateEntity } from "./handlers/handleCreateEntity/handleCreateEntity.js";
import { handleCreateEntityV2 } from "./handlers/handleCreateEntity/handleCreateEntityV2.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity/handleDeleteEntity.js";
import { handleDeleteEntityV2 } from "./handlers/handleDeleteEntity/handleDeleteEntityV2.js";
import { handleGetEntity } from "./handlers/handleGetEntity/handleGetEntity.js";
import { handleGetEntityV2 } from "./handlers/handleGetEntity/handleGetEntityV2.js";
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

export const entityRpcRouter = new Hono<HonoEnv>();
entityRpcRouter.post("/entities.create", ...handleCreateEntityV2);
entityRpcRouter.post("/entities.get", ...handleGetEntityV2);
entityRpcRouter.post("/entities.delete", ...handleDeleteEntityV2);
