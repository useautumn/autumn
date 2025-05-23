import { createClerkCli } from "@/external/clerkUtils.js";
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";

import { Request, Response } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handlePostOrg = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "create org",
    handler: async (req: Request, res: Response) => {
      const { userId, db } = req;

      const clerk = createClerkCli();
      const user = await clerk.users.getUser(userId!);

      let userMemberships = await clerk.users.getOrganizationMembershipList({
        userId: userId!,
      });

      let org;

      if (userMemberships.data.length === 0) {
        org = await clerk.organizations.createOrganization({
          name: `${user.firstName}'s Org`,
        });

        // 2. Create org membership for user
        await clerk.organizations.createOrganizationMembership({
          organizationId: org.id,
          userId: userId!,
          role: "org:admin",
        });

        await saveOrgToDB({
          db,
          id: org.id,
          slug: org.slug,
        });

        console.log(`Created new org: ${org.id} (${org.slug})`);
      } else {
        org = userMemberships.data[0].organization;
      }

      res.status(200).json({
        id: org.id,
        slug: org.slug,
      });
    },
  });
