import { Activity, FileText, Server } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSwarmSocket } from "./useSwarmSocket";
import { Overall } from "./views/Overall";
import { PerFile } from "./views/PerFile";
import { PerWorker } from "./views/PerWorker";

const WS_STORAGE_KEY = "testbench-ws-url";

function resolveWsUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const fromQuery = params.get("ws");
	if (fromQuery) {
		localStorage.setItem(WS_STORAGE_KEY, fromQuery);
		return fromQuery;
	}
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	const sameOrigin = `${proto}//${window.location.host}/ws`;
	// On the standalone dev server (:5910) the WS lives on another port, so fall
	// back to the last-used URL; otherwise we're served by the dashboard server
	// itself → connect to /ws on this same origin (no ?ws needed).
	if (window.location.port === "5910") {
		return localStorage.getItem(WS_STORAGE_KEY) ?? sameOrigin;
	}
	return sameOrigin;
}

export function App() {
	const [wsUrl, setWsUrl] = useState(resolveWsUrl);
	const [tab, setTab] = useState("overall");
	const socket = useSwarmSocket(wsUrl);
	const snap = socket.snapshot;

	const openFile = useCallback(
		(file: string) => {
			socket.subscribeFile(file);
			setTab("file");
		},
		[socket],
	);
	const status = useMemo(() => {
		if (!socket.connected) {
			return { dot: "bg-destructive", label: "disconnected" };
		}
		if (!snap) {
			return { dot: "bg-yellow-400", label: "connecting…" };
		}
		return { dot: "bg-green-500", label: snap.phase };
	}, [socket.connected, snap]);

	return (
		// Outer shell: full viewport, never scrolls. Mirrors the vite app's
		// `w-screen h-screen flex bg-outer-background` + inset rounded panel.
		<div className="flex h-dvh w-screen flex-col overflow-hidden bg-outer-background p-3">
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
				{/* Header — matches PageHeader spacing (icon + title left, actions right). */}
				<div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
					<div className="flex items-center gap-2 text-md text-muted-foreground">
						<Activity className="size-4" />
						<span className="font-medium">testbench — swarm</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<span className={cn("size-2 rounded-full", status.dot)} />
						<span className="tabular-nums">{status.label}</span>
						<input
							className="input-base input-shadow-default input-state-focus h-input w-60 rounded-lg border font-mono text-xs"
							defaultValue={wsUrl}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									const v = (e.target as HTMLInputElement).value.trim();
									localStorage.setItem(WS_STORAGE_KEY, v);
									setWsUrl(v);
								}
							}}
							placeholder="ws://…"
							spellCheck={false}
						/>
					</div>
				</div>

				{snap ? (
					<Tabs
						className="flex min-h-0 flex-1 flex-col"
						onValueChange={(v) => setTab(v as string)}
						value={tab}
					>
						<div className="shrink-0 border-b px-3 py-2">
							<TabsList>
								<TabsTrigger value="overall">
									<Activity className="mr-1.5 size-3.5" /> Overall
								</TabsTrigger>
								<TabsTrigger value="file">
									<FileText className="mr-1.5 size-3.5" /> Per-file
								</TabsTrigger>
								<TabsTrigger value="worker">
									<Server className="mr-1.5 size-3.5" /> Per-worker
								</TabsTrigger>
							</TabsList>
						</div>
						{/* Single scroll owner per view lives INSIDE each view; this region
						    just clips so the page never grows past one screen. */}
						<TabsContent
							className="mt-0 mb-0 min-h-0 flex-1 overflow-hidden p-3"
							value="overall"
						>
							<Overall onOpenFile={openFile} snap={snap} />
						</TabsContent>
						<TabsContent
							className="mt-0 mb-0 min-h-0 flex-1 overflow-hidden p-3"
							value="file"
						>
							<PerFile snap={snap} socket={socket} />
						</TabsContent>
						<TabsContent
							className="mt-0 mb-0 min-h-0 flex-1 overflow-hidden p-3"
							value="worker"
						>
							<PerWorker onOpenFile={openFile} snap={snap} socket={socket} />
						</TabsContent>
					</Tabs>
				) : (
					<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
						{socket.connected
							? "waiting for the first snapshot…"
							: "no connection — paste the dashboard ws:// URL above"}
					</div>
				)}
			</div>
		</div>
	);
}
