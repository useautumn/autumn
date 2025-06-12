import { createClerkCli } from "@/external/clerkUtils.js";
import { saveOrgToDB } from "@/external/webhooks/clerkWebhooks.js";
import { auth } from "@/utils/auth.js";

import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handlePostOrg = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "create org",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { userId, db } = req;

      console.log("userId", userId);

      const userMemberships = await auth.api.({
        userId: userId!,
      });
      

      // const clerk = createClerkCli();
      // const user = await clerk.users.getUser(userId!);

      // let userMemberships = await clerk.users.getOrganizationMembershipList({
      //   userId: userId!,
      // });

      // let org;

      // if (userMemberships.data.length === 0) {
      //   org = await clerk.organizations.createOrganization({
      //     name: `${user.firstName}'s Org`,
      //   });

      //   // 2. Create org membership for user
      //   await clerk.organizations.createOrganizationMembership({
      //     organizationId: org.id,
      //     userId: userId!,
      //     role: "org:admin",
      //   });

        // await saveOrgToDB({
        //   db,
        //   id: org.id,
        //   slug: org.slug,
        // });

      //   console.log(`Created new org: ${org.id} (${org.slug})`);
      // } else {
      //   org = userMemberships.data[0].organization;
      // }

      res.status(200).json({
        id: "123",
        slug: "123",
      });
      // res.status(200).json({
      //   id: org.id,
      //   slug: org.slug,
      // });
    },
  });
