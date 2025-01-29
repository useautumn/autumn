import { AppEnv } from "@autumn/shared";
import KSUID from "ksuid";

export const compareStatus = (statusA: string, statusB: string) => {
  const statusOrder = ["scheduled", "active", "past_due", "expired"];
  return statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB);
};

export const generateId = (prefix: string) => {
  if (!prefix) {
    return KSUID.randomSync().string;
  } else {
    return `${prefix}_${KSUID.randomSync().string}`;
  }
};

export const invalidNumber = (value: any) => {
  return isNaN(parseFloat(value));
};

export const getBackendErr = (error: any, defaultText: string) => {
  if (error.response && error.response.data) {
    const data = error.response.data;
    if (data.message && data.code) {
      return data.message;
    } else {
      return defaultText;
    }
  } else {
    return defaultText;
  }
};

export const getBackendErrObj = (error: any) => {
  if (error.response && error.response.data) {
    const data = error.response.data;
    if (data.code) {
      return { code: data.code, message: data.message };
    }
  }
  return null;
};

export const getEnvFromPath = (path: string) => {
  if (path.includes("/sandbox")) {
    return AppEnv.Sandbox;
  }
  return AppEnv.Live;
};

export const envToPath = (env: AppEnv, currentPath: string) => {
  if (env === AppEnv.Sandbox && !currentPath.includes("/sandbox")) {
    return `/sandbox${currentPath}`;
  } else if (env === AppEnv.Live && currentPath.includes("/sandbox")) {
    return currentPath.replace("/sandbox", "");
  }

  return null;
};

export const navigateTo = (path: string, router: any, env: AppEnv) => {
  if (env === AppEnv.Sandbox) {
    router.push(`/sandbox${path}`);
  } else {
    router.push(path);
  }
};

export const getRedirectUrl = (path: string, env: AppEnv) => {
  if (env === AppEnv.Sandbox) {
    return `/sandbox${path}`;
  } else {
    return path;
  }
};
