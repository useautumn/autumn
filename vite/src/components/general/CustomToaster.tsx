import { Toaster } from "react-hot-toast";

export const CustomToaster = () => {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: { fontSize: "14px" },
      }}
    />
  );
};
