import { useEffect, useRef, useState } from "react";

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

// The native "storage" event only fires in other tabs, so same-tab hooks listen for this.
const SAME_TAB_STORAGE_EVENT = "autumn:local-storage";

export function useLocalStorage<T>(
	key: string,
	initialValue: T,
): [T, SetValue<T>] {
	const isMounted = useRef(false);
	const shouldBroadcast = useRef(false);

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
			if (shouldBroadcast.current) {
				shouldBroadcast.current = false;
				window.dispatchEvent(
					new CustomEvent(SAME_TAB_STORAGE_EVENT, { detail: key }),
				);
			}
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
		const onSameTabStorage = (e: Event) => {
			if ((e as CustomEvent<string>).detail !== key) return;
			setStoredValue(readValue());
		};
		window.addEventListener("storage", onStorage);
		window.addEventListener(SAME_TAB_STORAGE_EVENT, onSameTabStorage);
		return () => {
			window.removeEventListener("storage", onStorage);
			window.removeEventListener(SAME_TAB_STORAGE_EVENT, onSameTabStorage);
		};
	}, [key]);

	// Ensure first render uses latest localStorage value (in case it changed before mount)
	useEffect(() => {
		if (isMounted.current) return;
		isMounted.current = true;
		setStoredValue(readValue());
	}, []);

	const setValue: SetValue<T> = (value) => {
		shouldBroadcast.current = true;
		setStoredValue((prev) => (value instanceof Function ? value(prev) : value));
	};

	return [storedValue, setValue];
}
