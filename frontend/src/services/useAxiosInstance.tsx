import { endpoint } from "@/utils/constants";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { AppEnv } from "@autumn/shared";

export function useAxiosInstance({
  env,
  isAuth = true,
}: {
  env: AppEnv;
  isAuth?: boolean;
}) {
  const axiosInstance = axios.create({
    baseURL: endpoint,
  });

  const { getToken } = useAuth();

  if (isAuth) {
    axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await getToken({
          template: "custom_template",
        });

        if (token) {
          config.headers["Authorization"] = `Bearer ${token}`;
          config.headers["app_env"] = env;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  return axiosInstance;
}
