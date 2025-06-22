import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { member, organizations, user } from "@autumn/shared";
import { and, desc, eq, gt, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { Router } from "express";

export const adminRouter: Router = Router();

// adminRouter.post()

adminRouter.get("/users", async (req: any, res: any) => {
  try {
    const { db } = req as ExtendedRequest;

    let { sortKey, search, after, before } = req.query;

    if (after) {
      after = {
        id: after.split(",")[0],
        createdAt: new Date(after.split(",")[1]),
      };
    } else if (before) {
      before = {
        id: before.split(",")[0],
        createdAt: new Date(before.split(",")[1]),
      };
    }

    const users = await db
      .select()
      .from(user)
      .where(
        and(
          search
            ? or(
                ilike(user.email, `%${search as string}%`),
                ilike(user.name, `%${search as string}%`),
                ilike(user.id, `%${search as string}%`),
              )
            : undefined,
          after
            ? or(
                lt(user.createdAt, after.createdAt),
                or(
                  and(
                    eq(user.createdAt, after.createdAt),
                    lt(user.id, after.id),
                  ),
                ),
              )
            : undefined,
          before
            ? or(
                gte(user.createdAt, before.createdAt),
                or(
                  and(
                    eq(user.createdAt, before.createdAt),
                    gt(user.id, before.id),
                  ),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(21);

    res.json({
      rows: users.slice(0, 20),
      hasNextPage: users.length > 20,
    });
  } catch (error) {
    handleFrontendReqError({
      res,
      req,
      error,
      action: "admin: search users",
    });
  }
});

adminRouter.get("/orgs", async (req: any, res: any) => {
  try {
    const { db } = req as ExtendedRequest;

    let { search, after, before } = req.query;

    if (after) {
      after = {
        id: after.split(",")[0],
        createdAt: new Date(after.split(",")[1]),
      };
    } else if (before) {
      before = {
        id: before.split(",")[0],
        createdAt: new Date(before.split(",")[1]),
      };
    }

    const orgs = await db
      .select()
      .from(organizations)
      .where(
        and(
          search
            ? or(
                ilike(organizations.name, `%${search as string}%`),
                ilike(organizations.id, `%${search as string}%`),
                ilike(organizations.slug, `%${search as string}%`),
              )
            : undefined,
          after
            ? or(
                lt(organizations.createdAt, after.createdAt),
                or(
                  and(
                    eq(organizations.createdAt, after.createdAt),
                    lt(organizations.id, after.id),
                  ),
                ),
              )
            : undefined,
          before
            ? or(
                gte(organizations.createdAt, before.createdAt),
                or(
                  and(
                    eq(organizations.createdAt, before.createdAt),
                    gt(organizations.id, before.id),
                  ),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(organizations.createdAt), desc(organizations.id))
      .limit(21);

    let orgIds = orgs.map((org) => org.id);

    let memberships = await db
      .select()
      .from(member)
      .leftJoin(user, eq(member.userId, user.id))
      .where(inArray(member.organizationId, orgIds));

    res.json({
      rows: orgs.slice(0, 20).map((org) => ({
        ...org,
        users: memberships
          .filter((membership) => membership.member.organizationId === org.id)
          .map((membership) => membership.user),
      })),
      hasNextPage: orgs.length > 20,
    });
  } catch (error) {
    handleFrontendReqError({
      res,
      req,
      error,
      action: "admin: search orgs",
    });
  }
});
