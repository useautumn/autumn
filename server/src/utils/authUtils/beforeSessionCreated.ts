import { db } from "@/db/initDrizzle.js";
import { Session } from "better-auth";
import { member, session as sessionTable } from "@autumn/shared";
import { eq, desc } from "drizzle-orm";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

export const beforeSessionCreated = async (session: Session) => {
  try {
    console.log(`Running beforeSessionCreated for user ${session.userId}`);
    let lastSession = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, session.userId))
      .orderBy(desc(sessionTable.createdAt))
      .limit(1);

    if (!lastSession || lastSession.length === 0) {
      const orgId = await createDefaultOrg({ session });

      return {
        data: {
          ...session,
          activeOrganizationId: orgId,
        },
      };
    }

    let memberships = await db
      .select()
      .from(member)
      .where(eq(member.userId, session.userId));

    let lastActiveId = lastSession[0].activeOrganizationId;
    console.log("lastActiveId", lastActiveId);

    if (lastActiveId) {
      let isMember = memberships.find((m) => m.organizationId === lastActiveId);

      if (isMember) {
        return {
          data: {
            ...session,
            activeOrganizationId: isMember.organizationId,
          },
        };
      }
    }

    if (memberships.length > 0) {
      return {
        data: {
          ...session,
          activeOrganizationId: memberships[0].organizationId,
        },
      };
    }

    return { data: session };
  } catch (error) {}
};
