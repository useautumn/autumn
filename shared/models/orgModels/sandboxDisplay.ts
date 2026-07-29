import { z } from "zod/v4";

export const SANDBOX_COLORS = [
	"gray",
	"blue",
	"green",
	"amber",
	"red",
	"pink",
] as const;

export type SandboxColor = (typeof SANDBOX_COLORS)[number];

export const DEFAULT_SANDBOX_COLOR: SandboxColor = "gray";
export const DEFAULT_SANDBOX_ICON = "Flask";

export const SandboxColorSchema = z.enum(SANDBOX_COLORS);
export const SandboxIconSchema = z.string().min(1).max(64);
export type SandboxIcon = z.infer<typeof SandboxIconSchema>;
