import { Hono } from "hono";
import { handleCheckAtomKeys } from "./handlers/handleCheckAtomKeys.js";
import { handleReadAtomSubject } from "./handlers/handleReadAtomSubject.js";
import { atomTokenHashMiddleware } from "./middlewares/atomTokenHashMiddleware.js";
import type { AtomHonoEnv } from "./types/atomHonoEnv.js";

/** An org's Atom calling Autumn, mounted at /atom before org and API-key auth. */
export const atomRouter = new Hono<AtomHonoEnv>();
atomRouter.use("*", atomTokenHashMiddleware);
atomRouter.post("/keys.check", handleCheckAtomKeys);
atomRouter.post("/subjects.read", handleReadAtomSubject);
