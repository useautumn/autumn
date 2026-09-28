import { Menu } from "@base-ui/react/menu";
import { LogOut, Moon, Plus, Sun } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { ApiRequestError, isMock } from "../api/client.ts";
import { useCapacity, useLogout, useMe } from "../api/hooks.ts";
import { cn, num } from "../lib/format.ts";
import { ErrorCallout, StatusDot } from "./status.tsx";
import { Button, buttonClass, Skeleton, Tooltip } from "./ui.tsx";

const NAV = [
	{ to: "/", label: "Runs", end: true },
	{ to: "/keys", label: "Keys" },
	{ to: "/accounts", label: "Accounts" },
	{ to: "/settings", label: "Settings" },
];

const useTheme = () => {
	const [dark, setDark] = useState(() =>
		document.documentElement.classList.contains("dark"),
	);
	const toggle = () => {
		const next = !dark;
		document.documentElement.classList.toggle("dark", next);
		localStorage.setItem("twd-theme", next ? "dark" : "light");
		setDark(next);
	};
	return { dark, toggle };
};

const CapacityChip = () => {
	const { data } = useCapacity();
	if (!data) return <Skeleton className="h-4 w-28" />;
	return (
		<Tooltip
			side="bottom"
			content={
				<span className="tabular-nums">
					{num(data.accounts.clean)} clean · {num(data.accounts.reserved)}{" "}
					reserved · {num(data.accounts.inUse)} in use ·{" "}
					{num(data.accounts.nuking)} nuking · {data.usableKeys} usable keys
				</span>
			}
		>
			<Link
				to="/accounts"
				className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted tabular-nums hover:bg-hover hover:text-fg md:inline-flex"
			>
				<StatusDot tone={data.gate === "draining" ? "warn" : "ok"} />
				{data.gate === "draining"
					? "draining"
					: `${num(data.maxFilesNow)} free`}
				<span className="text-faint">·</span>
				{data.liveRuns} live
			</Link>
		</Tooltip>
	);
};

const UserMenu = () => {
	const { data: me } = useMe();
	const logout = useLogout();
	if (!me) return <Skeleton className="size-6 rounded-full" />;
	const initials = (me.name ?? me.email).slice(0, 1).toUpperCase();
	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label="Account"
				className="flex cursor-pointer items-center gap-2 rounded-md py-0.5 pr-1.5 pl-0.5 text-xs text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-info/40"
			>
				{me.avatarUrl ? (
					<img src={me.avatarUrl} alt="" className="size-6 rounded-full" />
				) : (
					<span className="flex size-6 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-fg">
						{initials}
					</span>
				)}
				<span className="hidden sm:inline">{me.name ?? me.email}</span>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="end" sideOffset={6} className="z-50">
					<Menu.Popup className="min-w-52 rounded-lg border border-line bg-surface p-1 text-[13px] shadow-lg outline-none">
						<div className="px-2 py-1.5">
							<p className="font-medium">{me.name ?? me.email}</p>
							<p className="text-xs text-muted">{me.email}</p>
						</div>
						<div className="my-1 h-px bg-line" />
						<Menu.Item
							render={<Link to="/settings" />}
							className="flex cursor-pointer items-center rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-hover"
						>
							API keys
						</Menu.Item>
						<Menu.Item
							onClick={() => logout.mutate()}
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-muted outline-none data-[highlighted]:bg-hover data-[highlighted]:text-fg"
						>
							<LogOut className="size-3.5" /> Sign out
						</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
};

export const AppShell = () => {
	const me = useMe();
	const location = useLocation();
	const { dark, toggle } = useTheme();

	if (me.error instanceof ApiRequestError && me.error.status === 401)
		return (
			<Navigate to="/sign-in" replace state={{ from: location.pathname }} />
		);

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-sm">
				<div className="mx-auto flex h-12 max-w-[1400px] items-center gap-6 px-5">
					<Link
						to="/"
						className="flex items-center gap-2 font-mono text-[13px] font-semibold"
					>
						<span className="flex size-5 items-center justify-center rounded bg-accent text-[10px] text-accent-fg">
							tw
						</span>
						twd
						{isMock && (
							<span className="rounded bg-warn-soft px-1 py-px font-sans text-[10px] font-medium text-warn">
								mock
							</span>
						)}
					</Link>
					<nav className="flex items-center gap-0.5">
						{NAV.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.end}
								className={({ isActive }) =>
									cn(
										"rounded-md px-2.5 py-1 text-[13px] transition-colors",
										isActive ? "bg-raised text-fg" : "text-muted hover:text-fg",
									)
								}
							>
								{item.label}
							</NavLink>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-2">
						<CapacityChip />
						<Link
							to="/runs/new"
							className={buttonClass({ variant: "primary" })}
						>
							<Plus /> New run
						</Link>
						<Button
							variant="ghost"
							size="icon"
							aria-label={
								dark ? "Switch to light theme" : "Switch to dark theme"
							}
							onClick={toggle}
						>
							{dark ? <Sun /> : <Moon />}
						</Button>
						<UserMenu />
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-[1400px] flex-1 px-5 pt-6 pb-16">
				{me.error &&
				!(me.error instanceof ApiRequestError && me.error.status === 401) ? (
					<ErrorCallout error={me.error} />
				) : (
					<Outlet />
				)}
			</main>
		</div>
	);
};

export const PageHeader = ({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
}) => (
	<div className="mb-5 flex items-end justify-between gap-4">
		<div>
			<h1 className="text-lg font-semibold text-balance">{title}</h1>
			{description && (
				<p className="mt-0.5 text-[13px] text-pretty text-muted">
					{description}
				</p>
			)}
		</div>
		{actions && <div className="flex items-center gap-2">{actions}</div>}
	</div>
);
