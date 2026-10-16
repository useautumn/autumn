import type { HeldLock } from "./types";

const STORAGE_KEY = "sdk-test:atom-playground:locks";

export const loadLocks = (): Array<HeldLock> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
};

export const saveLocks = ({ locks }: { locks: Array<HeldLock> }) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(locks));
};
