import { Toaster as ToasterComponent } from "sonner";

export const CustomToaster = () => {
  return (
    <ToasterComponent
      position="top-center"
      className="flex justify-center"
      duration={6000}
      toastOptions={{
        unstyled: true,
        classNames: {
          error: `w-[350px] text-red-400 flex items-start
        gap-2 bg-white/70 backdrop-blur-sm border border-red-400 rounded-sm p-2 text-sm shadow-md`,
          success: `w-[350px] text-green-600 flex items-start
        gap-2 bg-white/90 backdrop-blur-sm border border-green-500 rounded-sm p-2 text-sm shadow-md`,
          warning: `w-[350px] text-yellow-600 flex items-start
        gap-2 bg-white/90 backdrop-blur-sm border border-yellow-500 rounded-sm p-2 text-sm shadow-md`,
        },
      }}
    />
  );
};
