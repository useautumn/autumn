import { DEFAULT_SANDBOX_COLOR, type SandboxColor } from "@autumn/shared";

const COLOR_CLASS_MAP: Record<SandboxColor, string> = {
	gray: "!text-gray-500",
	blue: "!text-blue-500",
	green: "!text-green-500",
	amber: "!text-amber-500",
	red: "!text-red-500",
	pink: "!text-pink-500",
};

const COLOR_PILL_MAP: Record<SandboxColor, string> = {
	gray: "text-gray-500 bg-gray-500/10 border-gray-500",
	blue: "text-blue-500 bg-blue-500/10 border-blue-500",
	green: "text-green-500 bg-green-500/10 border-green-500",
	amber: "text-amber-500 bg-amber-500/10 border-amber-500",
	red: "text-red-500 bg-red-500/10 border-red-500",
	pink: "text-pink-500 bg-pink-500/10 border-pink-500",
};

const COLOR_VALUE_MAP: Record<SandboxColor, string> = {
	gray: "#6a7282",
	blue: "#2b7fff",
	green: "#00c950",
	amber: "#f0b100",
	red: "#fb2c36",
	pink: "#f6339a",
};

export const sandboxColorClass = (color: string | null | undefined): string =>
	COLOR_CLASS_MAP[color as SandboxColor] ??
	COLOR_CLASS_MAP[DEFAULT_SANDBOX_COLOR];

export const sandboxPillClass = (color: string | null | undefined): string =>
	COLOR_PILL_MAP[color as SandboxColor] ??
	COLOR_PILL_MAP[DEFAULT_SANDBOX_COLOR];

export const sandboxColorValue = (color: string | null | undefined): string =>
	COLOR_VALUE_MAP[color as SandboxColor] ??
	COLOR_VALUE_MAP[DEFAULT_SANDBOX_COLOR];
