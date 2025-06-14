import axios from "axios";
import { endpoint } from "@/utils/constants";
import { AppEnv } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
const defaultParams = {
  isAuth: true,
};

export function useAxiosInstance(params?: { env?: AppEnv; isAuth?: boolean }) {
  const finalParams: any = {
    ...defaultParams,
    ...(params || {}),
  };

  const trueEnv = useEnv();

  const axiosInstance = axios.create({
    baseURL: endpoint,
    withCredentials: true,
  });

  axiosInstance.interceptors.request.use(
    async (config: any) => {
      config.headers["app_env"] = trueEnv;
      config.headers["x-api-version"] = "1.2";
      // const token = await getToken({
      //   template: "custom_template",
      // });

      // if (token) {
      //   // config.headers["Authorization"] = `Bearer ${token}`;
      //   config.headers["app_env"] = trueEnv;
      //   config.headers["x-api-version"] = "1.2";
      // }

      return config;
    },
    (error: any) => {
      return Promise.reject(error);
    },
  );

  // if (finalParams.isAuth) {
  //   axiosInstance.interceptors.request.use(
  //     async (config: any) => {
  //       const token = await getToken({
  //         template: "custom_template",
  //       });

  //       if (token) {
  //         config.headers["Authorization"] = `Bearer ${token}`;
  //         config.headers["app_env"] = trueEnv;
  //         config.headers["x-api-version"] = "1.2";
  //       }

  //       return config;
  //     },
  //     (error: any) => {
  //       return Promise.reject(error);
  //     },
  //   );
  // }

  return axiosInstance;
}
