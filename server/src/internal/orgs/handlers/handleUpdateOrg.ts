// import { auth } from "@/utils/auth.js";
// import { handleFrontendReqError } from "@/utils/errorUtils.js";

// export const handleUpdateOrg = async (req: any, res: any) => {
//   try {
//     await auth.api.updateOrganization({
//       data: {
//         name: req.body.name,
//         slug: req.body.slug,
//       },
//       organizationId: req.org.id,
//     });

//     res.status(200).json({ success: true });
//   } catch (error) {
//     handleFrontendReqError({
//       req,
//       error,
//       res,
//       action: "update org",
//     });
//   }
// };
