import { useAxiosInstance } from "./useAxiosInstance";
import { toast } from "sonner";

export const useUserService = () => {
  const axiosInstance = useAxiosInstance();

  const updateUserProfile = async (name: string) => {
    try {
      const { data, status } = await axiosInstance.put("/users/profile", {
        name,
      });

      if (status === 200) {
        toast.success("Profile updated successfully");
        return data.user;
      } else {
        throw new Error(data.message || "Failed to update profile");
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to update profile";
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    updateUserProfile,
  };
};
