import { useEffect, useRef, useState } from "react";

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, SetValue<T>] {
  const isMounted = useRef(false);

  const readValue = (): T => {
    try {
      if (typeof window === "undefined") return initialValue;
      const item = window.localStorage.getItem(key);
      return item == null ? initialValue : (JSON.parse(item) as T);
    } catch (error) {
      // Ignore parsing/storage errors and fall back to initial value
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Persist to localStorage whenever storedValue changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      // Ignore write errors (e.g., private mode / quota exceeded)
    }
  }, [key, storedValue]);

  // Sync value across tabs/windows
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const newValue =
          e.newValue == null ? initialValue : (JSON.parse(e.newValue) as T);
        setStoredValue(newValue);
      } catch (error) {
        // Ignore parsing errors
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  // Ensure first render uses latest localStorage value (in case it changed before mount)
  useEffect(() => {
    if (isMounted.current) return;
    isMounted.current = true;
    setStoredValue(readValue());
  }, []);

  const setValue: SetValue<T> = (value) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value));
  };

  return [storedValue, setValue];
}

export default useLocalStorage;
