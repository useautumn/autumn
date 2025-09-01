// const verifyClerkWebhook = async (req: Request, res: Response) => {
//   const wh = new Webhook(process.env.CLERK_SIGNING_SECRET!);

//   const headers = req.headers;
//   const payload = req.body;

//   const svix_id = headers["svix-id"];
//   const svix_timestamp = headers["svix-timestamp"];
//   const svix_signature = headers["svix-signature"];

//   if (!svix_id || !svix_timestamp || !svix_signature) {
//     res.status(400).json({
//       success: false,
//       message: "Error: Missing svix headers",
//     });
//     return;
//   }

//   let evt: any;
//   try {
//     evt = wh.verify(payload, {
//       "svix-id": svix_id as string,
//       "svix-timestamp": svix_timestamp as string,
//       "svix-signature": svix_signature as string,
//     });
//   } catch (err) {
//     console.log("Error: Could not verify webhook");
//     res.status(400).json({
//       success: false,
//       message: "Error: Could not verify webhook",
//     });
//     return;
//   }

//   return evt;
// };

// export const handleClerkWebhook = async (req: any, res: any) => {
//   let event = await verifyClerkWebhook(req, res);

//   if (!event) {
//     return;
//   }

//   const eventType = event.type;
//   const eventData = event.data;

//   try {
//     switch (eventType) {
//       case "organization.created":
//         await saveOrgToDB({
//           db: req.db,
//           id: eventData.id,
//           slug: eventData.slug,
//           createdAt: eventData.created_at,
//         });
//         break;

//       case "organization.deleted":
//         await handleOrgDeleted({
//           db: req.db,
//           eventData,
//         });
//         break;

//       default:
//         break;
//     }
//   } catch (error) {
//     handleRequestError({
//       req,
//       error,
//       res,
//       action: "Handle Clerk Webhook",
//     });
//     return;
//   }

//   return void res.status(200).json({
//     success: true,
//     message: "Webhook received",
//   });
// };
