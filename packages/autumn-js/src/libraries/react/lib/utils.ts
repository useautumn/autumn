import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Create a custom twMerge that understands the "au-" prefix
const twMerge = extendTailwindMerge({
	prefix: "au-",
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
