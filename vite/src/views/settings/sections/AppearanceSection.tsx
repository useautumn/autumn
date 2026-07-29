import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui";
import { Leaf, Monitor, Moon, Skull, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeProvider";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { SettingsSection } from "../SettingsSection";

interface PreviewColors {
	readonly bg: string;
	readonly sidebar: string;
	readonly card: string;
	readonly line: string;
	readonly header: string;
	readonly dot: string;
}

const LIGHT: PreviewColors = {
	bg: "bg-white",
	sidebar: "bg-[#f5f5f4]",
	card: "bg-[#fafaf9]",
	line: "bg-[#e5e5e5]",
	header: "bg-[#f5f5f4]",
	dot: "bg-[#d1d1d1]",
};

const DARK: PreviewColors = {
	bg: "bg-[#0a0a0a]",
	sidebar: "bg-[#000000]",
	card: "bg-[#0f0f0f]",
	line: "bg-[#1e1e1e]",
	header: "bg-[#111111]",
	dot: "bg-[#333333]",
};

const MODE_OPTIONS = [
	{ id: "light", label: "Light", icon: <Sun className="size-4" /> },
	{ id: "dark", label: "Dark", icon: <Moon className="size-4" /> },
	{ id: "system", label: "System", icon: <Monitor className="size-4" /> },
] as const;

const PRESET_OPTIONS = [
	{
		id: "classic",
		label: "Classic",
		description: "The original Autumn look",
		icon: <Leaf className="size-5 text-muted-foreground" />,
		light: {
			bg: "bg-[#fafaf9]",
			sidebar: "bg-[#F5F5F4]",
			card: "bg-[#f8f8f7]",
			line: "bg-[#e5e5e5]",
			header: "bg-[#F5F5F4]",
			dot: "bg-[#d1d1d1]",
		},
		dark: {
			bg: "bg-[#161616]",
			sidebar: "bg-[#121212]",
			card: "bg-[#1a1a1a]",
			line: "bg-[#2c2c2c]",
			header: "bg-[#1a1a1a]",
			dot: "bg-[#3a3a3a]",
		},
	},
	{
		id: "modern",
		label: { light: "Noon", dark: "Midnight" },
		description: "Deeper contrast, sharper feel",
		icon: <Moon className="size-5 text-muted-foreground" />,
		light: {
			bg: "bg-white",
			sidebar: "bg-[#fafaf9]",
			card: "bg-[#f7f7f7]",
			line: "bg-[#e5e5e5]",
			header: "bg-[#fafaf9]",
			dot: "bg-[#d1d1d1]",
		},
		dark: {
			bg: "bg-[#0a0a0a]",
			sidebar: "bg-[#000000]",
			card: "bg-[#0f0f0f]",
			line: "bg-[#1a1a1a]",
			header: "bg-[#0f0f0f]",
			dot: "bg-[#2a2a2a]",
		},
	},
	{
		id: "cursed",
		label: "Cursed",
		description: "A̸ ̷g̶r̴e̵a̷t̸ ̶T̵a̴n̶v̷i̴r̸ ̵A̶h̷m̴e̸d̵ ̷s̶p̴e̵c̷i̸a̶l̴",
		icon: <Skull className="size-5 text-muted-foreground" />,
		light: {
			bg: "bg-[#ff00aa]",
			sidebar: "bg-[#00ff88]",
			card: "bg-[#00ddff]",
			line: "bg-[#ff0000]",
			header: "bg-[#ffff00]",
			dot: "bg-[#ff8800]",
		},
		dark: {
			bg: "bg-[#2a0033]",
			sidebar: "bg-[#003322]",
			card: "bg-[#330044]",
			line: "bg-[#ff00ff]",
			header: "bg-[#441166]",
			dot: "bg-[#00ff88]",
		},
	},
] as const;

const tc = "transition-colors duration-200";

function ThemePreview({
	colors,
	height = "h-[72px]",
}: {
	colors: PreviewColors;
	height?: string;
}) {
	return (
		<div
			className={cn("rounded-md border overflow-hidden", tc, height, colors.bg)}
		>
			<div className="flex h-full">
				<div className={cn("w-[22%] h-full flex flex-col", tc, colors.sidebar)}>
					<div className="p-1.5 flex items-center gap-1">
						<div className={cn("size-2 rounded-full", tc, colors.dot)} />
					</div>
					<div className="flex flex-col gap-1 px-1.5">
						<div className={cn("h-1 w-full rounded-sm", tc, colors.line)} />
						<div className={cn("h-1 w-3/4 rounded-sm", tc, colors.line)} />
						<div className={cn("h-1 w-4/5 rounded-sm", tc, colors.line)} />
					</div>
				</div>
				<div className={cn("flex-1 flex flex-col", tc)}>
					<div
						className={cn(
							"h-4 border-b border-transparent flex items-center px-2",
							tc,
							colors.header,
						)}
					>
						<div className={cn("h-1 w-8 rounded-sm", tc, colors.line)} />
					</div>
					<div className="flex-1 p-2 flex flex-col gap-1.5">
						<div className={cn("h-3 w-3/4 rounded", tc, colors.card)} />
						<div className={cn("h-1.5 w-1/2 rounded-sm", tc, colors.line)} />
						<div className={cn("h-1.5 w-2/3 rounded-sm", tc, colors.line)} />
					</div>
				</div>
			</div>
		</div>
	);
}

function resolvePresetLabel(
	label: string | { light: string; dark: string },
	isDark: boolean,
): string {
	return typeof label === "string" ? label : isDark ? label.dark : label.light;
}

const systemPrefersDark = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-color-scheme: dark)").matches;

export const AppearanceSection = () => {
	const { mode, setMode, preset, setPreset, isDark } = useTheme();
	const { isAdmin } = useAdmin();
	const presetOptions = PRESET_OPTIONS.filter(
		(p) => p.id !== "cursed" || isAdmin,
	);

	return (
		<SettingsSection
			title="Appearance"
			description="Customize how the dashboard looks and feels"
		>
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium text-foreground">Mode</p>
				<div className="grid grid-cols-3 gap-3">
					{MODE_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => setMode(option.id)}
							className={cn(
								"flex flex-col gap-2 rounded-lg border p-2 transition-colors cursor-pointer text-left",
								mode === option.id
									? "border-primary bg-active-primary"
									: "border-border hover:border-muted-foreground/30",
							)}
						>
							<ThemePreview
								colors={
									option.id === "light"
										? LIGHT
										: option.id === "dark"
											? DARK
											: systemPrefersDark()
												? DARK
												: LIGHT
								}
							/>
							<div className="flex items-center gap-1.5 px-0.5">
								{option.icon}
								<span className="text-sm font-medium">{option.label}</span>
							</div>
						</button>
					))}
				</div>
			</div>

			<Card className="shadow-none bg-interactive-secondary">
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>
						Select a visual style for the dashboard
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-3">
						{presetOptions.map((option) => {
							const isActive = preset === option.id;
							return (
								<button
									key={option.id}
									type="button"
									onClick={() => setPreset(option.id)}
									className={cn(
										"flex flex-col gap-2.5 rounded-lg border p-2.5 transition-all duration-200 cursor-pointer text-left",
										option.id === "cursed" && "col-span-2",
										isActive
											? "border-primary ring-2 ring-primary/20 ring-offset-1 ring-offset-background"
											: "border-border hover:border-muted-foreground/30",
									)}
								>
									<ThemePreview
										colors={isDark ? option.dark : option.light}
										height="h-[80px]"
									/>
									<div className="flex items-center gap-2.5 px-0.5">
										{option.icon}
										<div className="flex flex-col gap-0.5">
											<span className="text-sm font-medium">
												{resolvePresetLabel(option.label, isDark)}
											</span>
											<span className="text-xs text-muted-foreground">
												{option.description}
											</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</CardContent>
			</Card>
		</SettingsSection>
	);
};
