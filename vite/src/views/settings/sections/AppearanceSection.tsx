import { Leaf, Monitor, Moon, Sun } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { useTheme } from "@/contexts/ThemeProvider";
import { cn } from "@/lib/utils";
import { SettingsSection } from "../SettingsSection";

interface PreviewColors {
	readonly bg: string;
	readonly sidebar: string;
	readonly card: string;
	readonly line: string;
	readonly header: string;
	readonly dot: string;
}

const PREVIEW_LIGHT: PreviewColors = {
	bg: "bg-white",
	sidebar: "bg-[#f5f5f4]",
	card: "bg-[#fafaf9]",
	line: "bg-[#e5e5e5]",
	header: "bg-[#f5f5f4]",
	dot: "bg-[#d1d1d1]",
};

const PREVIEW_DARK: PreviewColors = {
	bg: "bg-[#0a0a0a]",
	sidebar: "bg-[#000000]",
	card: "bg-[#0f0f0f]",
	line: "bg-[#1e1e1e]",
	header: "bg-[#111111]",
	dot: "bg-[#333333]",
};

const systemPrefersDark =
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-color-scheme: dark)").matches;

const MODE_OPTIONS = [
	{ id: "light", label: "Light", icon: <Sun className="size-4" />, preview: PREVIEW_LIGHT },
	{ id: "dark", label: "Dark", icon: <Moon className="size-4" />, preview: PREVIEW_DARK },
	{ id: "system", label: "System", icon: <Monitor className="size-4" />, preview: systemPrefersDark ? PREVIEW_DARK : PREVIEW_LIGHT },
] as const;

const PRESET_OPTIONS = [
	{
		id: "classic",
		label: "Classic",
		description: "The original Autumn look",
		icon: <Leaf className="size-5 text-muted-foreground" />,
		light: { bg: "bg-[#fafaf9]", sidebar: "bg-[#F5F5F4]", card: "bg-[#f8f8f7]", line: "bg-[#e5e5e5]", header: "bg-[#F5F5F4]", dot: "bg-[#d1d1d1]" },
		dark: { bg: "bg-[#161616]", sidebar: "bg-[#121212]", card: "bg-[#1a1a1a]", line: "bg-[#2c2c2c]", header: "bg-[#1a1a1a]", dot: "bg-[#3a3a3a]" },
	},
	{
		id: "modern",
		label: { light: "Noon", dark: "Midnight" },
		description: "Deeper contrast, sharper feel",
		icon: <Moon className="size-5 text-muted-foreground" />,
		light: { bg: "bg-white", sidebar: "bg-[#fafaf9]", card: "bg-[#f7f7f7]", line: "bg-[#e5e5e5]", header: "bg-[#fafaf9]", dot: "bg-[#d1d1d1]" },
		dark: { bg: "bg-[#0a0a0a]", sidebar: "bg-[#000000]", card: "bg-[#0f0f0f]", line: "bg-[#1a1a1a]", header: "bg-[#0f0f0f]", dot: "bg-[#2a2a2a]" },
	},
] as const;

function ThemePreview({ colors, height = "h-[72px]" }: { colors: PreviewColors; height?: string }) {
	return (
		<div className={cn("rounded-md border overflow-hidden transition-colors duration-200", height, colors.bg)}>
			<div className="flex h-full">
				<div className={cn("w-[22%] h-full flex flex-col transition-colors duration-200", colors.sidebar)}>
					<div className="p-1.5 flex items-center gap-1">
						<div className={cn("size-2 rounded-full transition-colors duration-200", colors.dot)} />
					</div>
					<div className="flex flex-col gap-1 px-1.5">
						<div className={cn("h-1 w-full rounded-sm transition-colors duration-200", colors.line)} />
						<div className={cn("h-1 w-3/4 rounded-sm transition-colors duration-200", colors.line)} />
						<div className={cn("h-1 w-4/5 rounded-sm transition-colors duration-200", colors.line)} />
					</div>
				</div>
				<div className="flex-1 flex flex-col transition-colors duration-200">
					<div className={cn("h-4 border-b border-transparent flex items-center px-2 transition-colors duration-200", colors.header)}>
						<div className={cn("h-1 w-8 rounded-sm transition-colors duration-200", colors.line)} />
					</div>
					<div className="flex-1 p-2 flex flex-col gap-1.5">
						<div className={cn("h-3 w-3/4 rounded transition-colors duration-200", colors.card)} />
						<div className={cn("h-1.5 w-1/2 rounded-sm transition-colors duration-200", colors.line)} />
						<div className={cn("h-1.5 w-2/3 rounded-sm transition-colors duration-200", colors.line)} />
					</div>
				</div>
			</div>
		</div>
	);
}

export const AppearanceSection = () => {
	const { mode, setMode, preset, setPreset, isDark } = useTheme();

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
							<ThemePreview colors={option.preview} />
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
						{PRESET_OPTIONS.map((option) => {
							const isActive = preset === option.id;
							const colors = isDark ? option.dark : option.light;
							const label = typeof option.label === "string"
								? option.label
								: isDark ? option.label.dark : option.label.light;
							return (
								<button
									key={option.id}
									type="button"
									onClick={() => setPreset(option.id)}
									className={cn(
										"flex flex-col gap-2.5 rounded-lg border p-2.5 transition-all duration-200 cursor-pointer text-left",
										isActive
											? "border-primary ring-2 ring-primary/20 ring-offset-1 ring-offset-background"
											: "border-border hover:border-muted-foreground/30",
									)}
								>
									<ThemePreview colors={colors} height="h-[80px]" />
									<div className="flex items-center gap-2.5 px-0.5">
										{option.icon}
										<div className="flex flex-col gap-0.5">
											<span className="text-sm font-medium">{label}</span>
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
