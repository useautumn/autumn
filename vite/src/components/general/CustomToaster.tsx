import {
	CheckCircleIcon,
	InfoIcon,
	SealWarningIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import { Toaster as ToasterComponent } from "sonner";

// Legacy CustomToaster implementation - commented for reference
// export const CustomToaster = () => {
// 	return (
// 		<ToasterComponent
// 			position="top-center"
// 			className="flex justify-center"
// 			duration={6000}
// 			toastOptions={{
// 				unstyled: true,
// 				classNames: {
// 					error: `w-[350px] text-red-400 flex items-start
//         gap-2 bg-white/70 backdrop-blur-sm border border-red-400 rounded-sm p-2 text-sm shadow-md`,
// 					success: `w-[350px] text-green-600 flex items-start
//         gap-2 bg-white/90 backdrop-blur-sm border border-green-500 rounded-sm p-2 text-sm shadow-md`,
// 					warning: `w-[350px] text-yellow-600 flex items-start
//         gap-2 bg-white/90 backdrop-blur-sm border border-yellow-500 rounded-sm p-2 text-sm shadow-md`,
// 				},
// 			}}
// 		/>
// 	);
// };

export const CustomToaster = () => {
	return (
		<ToasterComponent
			position="top-center"
			className="flex justify-center"
			duration={6000}
			toastOptions={{
				className:
					"w-96 px-3 pt-3 pb-2.5 bg-white rounded-xl shadow-[0px_4px_4px_0px_rgba(0,0,0,0.02)] shadow-[inset_0px_-4px_6px_0px_rgba(0,0,0,0.04)] outline outline-16 outline-[#D1D1D1] inline-flex flex-row justify-start items-start gap-3 overflow-hidden",
			}}
			icons={{
				success: <CheckCircleIcon size={16} weight="fill" color="#00C745" />,
				error: <SealWarningIcon size={16} weight="fill" color="#DE171A" />,
				warning: <SealWarningIcon size={16} weight="fill" color="#DE171A" />,
				info: <InfoIcon size={16} weight="fill" color="#008DF2" />,
				loading: <SpinnerIcon size={16} weight="fill" color="#008DF2" />,
			}}
		></ToasterComponent>
	);
};
