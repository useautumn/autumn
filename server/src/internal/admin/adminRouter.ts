import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleGetOrgMember } from "./handleGetOrgMember";
import { handleListAdminOrgs } from "./handleListAdminOrgs";
import { handleListAdminUsers } from "./handleListAdminUsers";

export const honoAdminRouter = new Hono<HonoEnv>();

honoAdminRouter.get("/users", ...handleListAdminUsers);
honoAdminRouter.get("/orgs", ...handleListAdminOrgs);
honoAdminRouter.get("/org-member", ...handleGetOrgMember);
