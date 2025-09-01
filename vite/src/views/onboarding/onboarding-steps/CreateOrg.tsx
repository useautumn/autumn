// export const CreateOrgStep = ({
//   number,
//   pollForOrg,
// }: {
//   number: number;
//   pollForOrg: () => Promise<void>;
// }) => {

//   const env = useEnv();
//   const axios = useAxiosInstance({ env });

//   const [isExploding, setIsExploding] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [fields, setFields] = useState({
//     name: org?.name || "",
//     slug: "",
//   });

//   const handleCreateOrg = async () => {
//     setLoading(true);

//     try {
//       if (!createOrganization) {
//         toast.error("Error creating organization");
//         return;
//       }

//       const org = await createOrganization({
//         name: fields.name,
//       });

//       // Create org in Autumn
//       const res = await axios.post("/organization", {
//         orgId: org.id,
//       });

//       console.log("Org created in Autumn", res);

//       await setActive({ organization: org.id });
//       // await pollForOrg();
//       toast.success(`Created your organization: ${org.name}`);
//       setIsExploding(true);
//     } catch (error: any) {
//       if (error.message) {
//         toast.error(error.message);
//       } else {
//         toast.error("Error creating organization");
//       }
//     }
//     setLoading(false);
//   };

//   return (
//     <Step
//       title="Create your organization"
//       number={number}
//       description={
//         <>
//           <div className="flex relative w-fit">
//             <div className="flex bg-purple-100 shadow-sm shadow-purple-500/50 w-fit px-3 py-0.5 rounded-lg  absolute w-full h-full z-0"></div>
//             <p className="flex items-center border border-primary w-fit px-3 py-0.5 rounded-lg z-10">
//               <span className="animate-bounce">👋</span>
//               <span className="font-bold text-primary">
//                 &nbsp; Welcome to Autumn
//               </span>
//             </p>
//           </div>
//           <p>
//             Create an organization to get started and integrate pricing within 5
//             minutes.
//           </p>
//         </>
//       }
//     >
//       {/* <div className="flex gap-8 w-full justify-between flex-col lg:flex-row"> */}
//       <div className="w-full min-w-md flex gap-2">
//         <Input
//           placeholder="Org name"
//           className="w-full"
//           value={org?.name || fields.name}
//           disabled={!!org?.name}
//           onChange={(e) => {
//             const newFields = { ...fields, name: e.target.value };
//             setFields(newFields);
//           }}
//         />
//         <Button
//           className="min-w-44 w-44 max-w-44"
//           disabled={!!org?.name}
//           onClick={handleCreateOrg}
//           isLoading={loading}
//           variant="gradientPrimary"
//           // startIcon={<Building size={12} />}
//         >
//           Create Organization
//         </Button>

//         {isExploding && (
//           <ConfettiExplosion
//             className="absolute"
//             force={0.8}
//             duration={3000}
//             particleCount={250}
//             zIndex={1000}
//             width={1600}
//             onComplete={() => {
//               console.log("complete");
//             }}
//           />
//         )}
//       </div>
//       {/* </div> */}
//     </Step>
//   );
// };
