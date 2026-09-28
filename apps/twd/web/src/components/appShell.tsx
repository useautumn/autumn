import { PageContainer } from "@autumn/ui/components/general/page-container";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui/components/ui/dropdown-menu";
import {
	ChevronsUpDown,
	CircleDollarSign,
	KeyRound,
	List,
	LogOut,
	Monitor,
	Moon,
	Plus,
	Settings2,
	Sun,
	Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Link,
	Navigate,
	NavLink,
	Outlet,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { ApiRequestError, isMock } from "../api/client.ts";
import { useCapacity, useLogout, useMe } from "../api/hooks.ts";
import { type LiveStatus, useLiveStatus, useLiveTopics } from "../api/live.ts";
import { cn, num } from "../lib/format.ts";
import { ErrorCallout, StatusDot, type Tone } from "./status.tsx";
import { Skeleton, Tooltip } from "./ui.tsx";

const ICON_STROKE = 1.5;

/** Autumn's sidebar row (vite/src/views/main-sidebar/sidebarRowClass.ts). */
const rowClass = (isActive: boolean) =>
	cn(
		"group/row flex h-[30px] w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-[450] leading-4 outline-none transition-colors duration-150 ease-out focus-visible:bg-black/[0.05] dark:focus-visible:bg-white/[0.06]",
		isActive
			? "bg-black/[0.06] text-foreground dark:bg-white/[0.08] dark:text-[#F5F5F5]"
			: "text-[#555555] hover:bg-black/[0.03] hover:text-foreground dark:text-[#A1A1A1] dark:hover:bg-white/[0.04] dark:hover:text-[#F5F5F5]",
	);
const iconClass = (isActive: boolean) =>
	cn(
		"flex size-4 shrink-0 items-center justify-center transition-colors duration-150 ease-out [&_svg]:size-4",
		isActive
			? "text-foreground dark:text-[#EDEDED]"
			: "text-[#8A8A8A] group-hover/row:text-foreground dark:text-[#7A7A7A] dark:group-hover/row:text-[#EDEDED]",
	);

const NavItem = ({
	to,
	end,
	icon,
	title,
	right,
}: {
	to: string;
	end?: boolean;
	icon: ReactNode;
	title: string;
	right?: ReactNode;
}) => (
	<NavLink to={to} end={end} className={({ isActive }) => rowClass(isActive)}>
		{({ isActive }) => (
			<>
				<span className={iconClass(isActive)}>{icon}</span>
				<span className="truncate">{title}</span>
				{right && <span className="ml-auto">{right}</span>}
			</>
		)}
	</NavLink>
);

const NavSection = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => (
	<div className="flex flex-col gap-px">
		<span className="px-2.5 pb-1.5 text-xs font-medium leading-4 text-[#8A8A8A] dark:text-[#6B6B6B]">
			{title}
		</span>
		{children}
	</div>
);

type ThemeMode = "light" | "dark" | "system";
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

const useTheme = () => {
	const [mode, setMode] = useState<ThemeMode>(
		() => (localStorage.getItem("twd-theme") as ThemeMode | null) ?? "system",
	);
	const apply = (next: ThemeMode) => {
		const dark =
			next === "dark" ||
			(next === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
		document.documentElement.classList.toggle("dark", dark);
		localStorage.setItem("twd-theme", next);
		setMode(next);
	};
	return { mode, apply };
};

const LIVE_STATUS: Record<LiveStatus, { tone: Tone; label: string }> = {
	live: { tone: "ok", label: "Live" },
	connecting: { tone: "idle", label: "Connecting" },
	reconnecting: { tone: "warn", label: "Reconnecting" },
	offline: { tone: "bad", label: "Offline" },
};

const CapacityRow = () => {
	const { data } = useCapacity();
	const status = useLiveStatus();
	const live = LIVE_STATUS[status];
	return (
		<Tooltip
			side="right"
			content={
				<span className="tabular-nums">
					{live.label}
					{data && (
						<>
							{" "}
							· {num(data.accounts.clean)} clean · {num(data.accounts.inUse)} in
							use · {num(data.accounts.nuking)} nuking · {data.usableKeys}{" "}
							usable keys
							{data.queuedRuns > 0 && ` · ${data.queuedRuns} queued`}
						</>
					)}
				</span>
			}
		>
			<Link
				to="/accounts"
				className="flex h-[30px] items-center gap-2 rounded-md px-2.5 text-xs text-tertiary-foreground tabular-nums hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
			>
				<StatusDot tone={live.tone} pulse={status === "reconnecting"} />
				<span className={cn(status !== "live" && "text-foreground")}>
					{live.label}
				</span>
				{data ? (
					<span className="ml-auto truncate text-subtle">
						{data.gate === "draining"
							? "draining"
							: `${num(data.maxFilesNow)} free · ${data.liveRuns} live${data.queuedRuns ? ` · ${data.queuedRuns} queued` : ""}`}
					</span>
				) : (
					<Skeleton className="ml-auto h-3 w-16" />
				)}
			</Link>
		</Tooltip>
	);
};

const UserMenu = () => {
	const { data: me } = useMe();
	const logout = useLogout();
	const navigate = useNavigate();
	const theme = useTheme();
	if (!me) return <Skeleton className="h-[30px] w-full" />;
	const initials = (me.name ?? me.email).slice(0, 1).toUpperCase();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={rowClass(false)}>
				{me.avatarUrl ? (
					<img src={me.avatarUrl} alt="" className="size-4 rounded-full" />
				) : (
					<span className="flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
						{initials}
					</span>
				)}
				<span className="truncate">{me.name ?? me.email}</span>
				<ChevronsUpDown
					className="ml-auto size-3.5 text-subtle"
					strokeWidth={ICON_STROKE}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-xs text-subtle">
						{me.email}
					</DropdownMenuLabel>
					{(["light", "dark", "system"] as const).map((m) => {
						const Icon = THEME_ICONS[m];
						return (
							<DropdownMenuItem
								key={m}
								onClick={() => theme.apply(m)}
								className={cn(theme.mode === m && "text-foreground")}
							>
								<Icon className="size-3.5" strokeWidth={ICON_STROKE} />
								<span className="capitalize">{m}</span>
								{theme.mode === m && (
									<span className="ml-auto text-xs text-subtle">Active</span>
								)}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => navigate("/settings")}>
					<KeyRound className="size-3.5" strokeWidth={ICON_STROKE} />
					API keys
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => logout.mutate()}>
					<LogOut className="size-3.5" strokeWidth={ICON_STROKE} />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const Sidebar = () => (
	<div
		data-slot="main-sidebar"
		className="flex h-full w-[200px] shrink-0 flex-col justify-between overflow-y-auto px-2.5 py-3.5"
	>
		<div className="flex flex-col gap-3.5">
			<Link to="/" className="flex h-8 items-center gap-2 px-1.5">
				<span className="flex size-5 items-center justify-center rounded-md bg-foreground font-mono text-[10px] font-semibold text-background">
					tw
				</span>
				<span className="text-[13px] font-[550] leading-4 tracking-[-0.005em] text-foreground">
					twd
				</span>
				{isMock && (
					<span className="ml-auto text-[10px] font-medium leading-3 tracking-[0.04em] text-[#8A8A8A] dark:text-[#7A7A7A]">
						MOCK
					</span>
				)}
			</Link>
			<nav className="flex flex-col gap-[18px]">
				<NavSection title="Swarm">
					<NavItem
						to="/"
						end
						title="Runs"
						icon={<List strokeWidth={ICON_STROKE} />}
					/>
					<NavItem
						to="/runs/new"
						title="New run"
						icon={<Plus strokeWidth={ICON_STROKE} />}
					/>
					<NavItem
						to="/costs"
						title="Costs"
						icon={<CircleDollarSign strokeWidth={ICON_STROKE} />}
					/>
				</NavSection>
				<NavSection title="Pool">
					<NavItem
						to="/accounts"
						title="Accounts"
						icon={<Users strokeWidth={ICON_STROKE} />}
					/>
					<NavItem
						to="/keys"
						title="Stripe keys"
						icon={<KeyRound strokeWidth={ICON_STROKE} />}
					/>
				</NavSection>
			</nav>
		</div>
		<div className="flex flex-col gap-px pt-4">
			<CapacityRow />
			<NavItem
				to="/settings"
				title="Settings"
				icon={<Settings2 strokeWidth={ICON_STROKE} />}
			/>
			<UserMenu />
		</div>
	</div>
);

export const AppShell = () => {
	const me = useMe();
	const location = useLocation();
	const signedOut =
		me.error instanceof ApiRequestError && me.error.status === 401;
	useLiveTopics(!signedOut && "capacity");

	if (signedOut)
		return (
			<Navigate to="/sign-in" replace state={{ from: location.pathname }} />
		);

	return (
		<div className="flex h-screen w-screen bg-outer-background">
			<div className="hidden sm:flex">
				<Sidebar />
			</div>
			<main className="relative flex h-screen w-full flex-col overflow-hidden sm:py-3 sm:pr-3">
				<div className="relative flex h-full w-full flex-col overflow-hidden sm:rounded-xl sm:border">
					<div
						data-main-content
						className="relative h-full w-full overflow-auto bg-background"
					>
						<PageContainer>
							<div>
								{me.error ? <ErrorCallout error={me.error} /> : <Outlet />}
							</div>
						</PageContainer>
					</div>
				</div>
			</main>
		</div>
	);
};
