import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import routesJson from "./routes.json";

type RouteRow = {
	handlerName: string;
	handlerFile: string | null;
	method: string;
	path: string;
	style: "REST" | "RPC";
	group: string;
	mountChain: string[];
	sourceRouterFile: string;
	routeKind?: "createRoute" | "plain";
	needsScopes?: boolean;
	isWebhookExempt?: boolean;
};

type RoutesFile = {
	generatedAt: string;
	totalRoutesNeedingScopes: number;
	routes: RouteRow[];
	orphans: unknown[];
};

const RESOURCES = [
	"organisation",
	"customers",
	"features",
	"plans",
	"rewards",
	"balances",
	"billing",
	"analytics",
	"apiKeys",
	"platform",
] as const;

type Resource = (typeof RESOURCES)[number];
type Action = "read" | "write";

const META_SCOPES = ["superuser", "owner", "admin", "public"] as const;
type MetaScope = (typeof META_SCOPES)[number];

type ScopeString =
	| `${Exclude<Resource, "analytics">}:${Action}`
	| "analytics:read"
	| MetaScope;

type Shape = "array" | "any" | "all" | "any-and-all";

type Decision = {
	decision: "decided" | "skip" | "unknown";
	scopes: ScopeString[];
	shape: Shape;
	note?: string;
	decidedAt: string;
};

const STORAGE_LOCAL_KEY = "scopePicker:local";
const API = "/api/scope-picker/decisions";

function rowKey(r: RouteRow) {
	return `${r.method}|${r.path}|${r.handlerName}`;
}

const RESOURCE_COLORS: Record<Resource, string> = {
	organisation: "#a78bfa",
	customers: "#60a5fa",
	features: "#34d399",
	plans: "#fbbf24",
	rewards: "#f472b6",
	balances: "#22d3ee",
	billing: "#fb923c",
	analytics: "#c084fc",
	apiKeys: "#f87171",
	platform: "#14b8a6",
};

const RESOURCE_KEYS: Record<string, Resource> = {
	"1": "organisation",
	"2": "customers",
	"3": "features",
	"4": "plans",
	"5": "rewards",
	"6": "balances",
	"7": "billing",
	"8": "analytics",
	"9": "apiKeys",
	"0": "platform",
};

/** Guess a sensible default resource based on the route path. */
function guessResource(r: RouteRow): Resource | null {
	const p = r.path.toLowerCase();
	// Platform API takes precedence over organisation / customers prefix matches.
	if (p.includes("/platform/") || p.startsWith("/v1/platform") || p.includes("platform.")) return "platform";
	if (p.includes("/customers") || p.includes("customers.") || p.includes("/entities") || p.includes("entities."))
		return "customers";
	if (p.includes("/plans") || p.includes("plans.") || p.includes("/products")) return "plans";
	if (p.includes("/features") || p.includes("features.")) return "features";
	if (p.includes("/balances") || p.includes("balances.") || p.includes("/check") || p.includes("/track") || p.includes("/usage") || p.includes("/entitled"))
		return "balances";
	if (p.includes("/billing") || p.includes("billing.") || p.includes("/attach") || p.includes("/cancel") || p.includes("/checkout") || p.includes("/setup_payment"))
		return "billing";
	if (p.includes("/rewards") || p.includes("/referrals") || p.includes("/redemptions") || p.includes("/reward_programs") || p.includes("referrals.") || p.includes("rewards."))
		return "rewards";
	if (p.includes("/events") || p.includes("events.") || p.includes("/query") || p.includes("analytics"))
		return "analytics";
	if (p.includes("/organization") || p.includes("/admin") || p.includes("/webhooks"))
		return "organisation";
	if (p.includes("apikey") || p.includes("api_key")) return "apiKeys";
	return null;
}

/** Guess a sensible default action based on HTTP method + path hints. */
function guessAction(r: RouteRow): Action {
	const m = r.method.toUpperCase();
	if (m === "GET") return "read";
	const p = r.path.toLowerCase();
	// RPC read-ish
	if (p.endsWith(".list") || p.endsWith(".get") || p.includes(".preview") || p.endsWith("/preview"))
		return "read";
	return "write";
}

export function ScopePicker() {
	const data = routesJson as RoutesFile;
	const allRoutes = useMemo(
		() =>
			(data.routes as RouteRow[]).filter((r) => {
				if (r.isWebhookExempt) return false;
				// Keep rows where needsScopes is undefined (older snapshot) OR true.
				if (r.needsScopes === false) return false;
				return true;
			}),
		[data.routes],
	);

	const [decisions, setDecisions] = useState<Record<string, Decision>>({});
	const [loadedFromDisk, setLoadedFromDisk] = useState(false);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [filterResource, setFilterResource] = useState<Resource | "all">("all");
	const [filterGroup, setFilterGroup] = useState<string>("all");
	const [filterQ, setFilterQ] = useState("");
	const [showDecided, setShowDecided] = useState(true);
	const [index, setIndex] = useState(0);
	const [draft, setDraft] = useState<{
		resource: Resource | null;
		actions: Set<Action>;
		meta: Set<MetaScope>;
		note: string;
		shape: Shape;
	}>({
		resource: null,
		actions: new Set(),
		meta: new Set(),
		note: "",
		shape: "array",
	});

	const searchRef = useRef<HTMLInputElement | null>(null);

	// Load decisions from disk on mount
	useEffect(() => {
		(async () => {
			try {
				const res = await fetch(API);
				const payload = await res.json();
				const d = (payload?.decisions ?? {}) as Record<string, Decision>;
				setDecisions(d);
			} catch {
				// Fallback to localStorage
				try {
					const raw = localStorage.getItem(STORAGE_LOCAL_KEY);
					if (raw) setDecisions(JSON.parse(raw));
				} catch {
					/* noop */
				}
			}
			setLoadedFromDisk(true);
		})();
	}, []);

	// Persist (debounced via microtask per change is fine — tiny payload)
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (!loadedFromDisk) return;
		if (saveTimer.current) clearTimeout(saveTimer.current);
		setSaveState("saving");
		saveTimer.current = setTimeout(async () => {
			try {
				const res = await fetch(API, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ decisions }),
				});
				if (!res.ok) throw new Error(`persist failed: ${res.status}`);
				localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(decisions));
				setSaveState("saved");
			} catch {
				try {
					localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(decisions));
				} catch {
					/* noop */
				}
				setSaveState("error");
			}
		}, 120);
	}, [decisions, loadedFromDisk]);

	// Groups list (sorted, "all" first)
	const groups = useMemo(() => {
		return ["all", ...Array.from(new Set(allRoutes.map((r) => r.group))).sort()];
	}, [allRoutes]);

	// Filtered routes
	const filtered = useMemo(() => {
		const q = filterQ.trim().toLowerCase();
		return allRoutes.filter((r) => {
			if (filterGroup !== "all" && r.group !== filterGroup) return false;
			if (filterResource !== "all") {
				const d = decisions[rowKey(r)];
				// Pick the first resource-flavoured scope (skip meta-only entries).
				const resourceScopes = d?.scopes?.filter((s) => s.includes(":")) ?? [];
				const resource = resourceScopes[0]?.split(":")[0] as Resource | undefined;
				// If no decision yet, use heuristic guess for filter
				const guess = resource ?? guessResource(r);
				if (guess !== filterResource) return false;
			}
			if (!showDecided && decisions[rowKey(r)]?.decision === "decided") return false;
			if (q) {
				const hay = `${r.method} ${r.path} ${r.handlerName} ${r.group} ${r.handlerFile ?? ""}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [allRoutes, decisions, filterGroup, filterResource, filterQ, showDecided]);

	// Clamp index when filter changes
	useEffect(() => {
		if (index >= filtered.length) setIndex(Math.max(0, filtered.length - 1));
	}, [filtered.length, index]);

	const current = filtered[index];

	// Prefill draft when current changes
	useEffect(() => {
		if (!current) return;
		const existing = decisions[rowKey(current)];
		if (existing) {
			const rset = new Set<Action>();
			const mset = new Set<MetaScope>();
			let firstResource: Resource | null = null;
			for (const s of existing.scopes) {
				if ((META_SCOPES as readonly string[]).includes(s)) {
					mset.add(s as MetaScope);
					continue;
				}
				const [resource, act] = s.split(":");
				if (act === "read" || act === "write") rset.add(act);
				if (!firstResource && RESOURCES.includes(resource as Resource)) {
					firstResource = resource as Resource;
				}
			}
			setDraft({
				resource: firstResource ?? guessResource(current),
				actions: rset,
				meta: mset,
				note: existing.note ?? "",
				shape: existing.shape ?? "array",
			});
		} else {
			const guessRes = guessResource(current);
			const guessAct = guessAction(current);
			// Heuristic: routes under /admin are Autumn-staff-only and should
			// default to `superuser` rather than an R/W scope.
			const isAdminRoute = current.group === "admin" || current.path.startsWith("/admin/") || current.path.startsWith("/sandbox/admin/");
			setDraft({
				resource: isAdminRoute ? null : guessRes,
				actions: isAdminRoute ? new Set() : new Set([guessAct]),
				meta: isAdminRoute ? new Set(["superuser"]) : new Set(),
				note: "",
				shape: "array",
			});
		}
	}, [current, decisions]);

	const setResource = useCallback((res: Resource) => {
		setDraft((d) => {
			// analytics cannot be write; auto-downgrade
			const actions = new Set(d.actions);
			if (res === "analytics") actions.delete("write");
			return { ...d, resource: res, actions };
		});
	}, []);

	const toggleAction = useCallback((a: Action) => {
		setDraft((d) => {
			if (d.resource === "analytics" && a === "write") return d;
			const next = new Set(d.actions);
			if (next.has(a)) next.delete(a);
			else next.add(a);
			return { ...d, actions: next };
		});
	}, []);

	const toggleMeta = useCallback((m: MetaScope) => {
		setDraft((d) => {
			const next = new Set(d.meta);
			if (next.has(m)) next.delete(m);
			else next.add(m);
			return { ...d, meta: next };
		});
	}, []);

	/**
	 * Save the current draft to the decisions map.
	 *
	 * `kind`:
	 *   - "decided"  → persist current draft scopes
	 *   - "skip"     → mark as skipped (no scopes)
	 *   - "unknown"  → mark as unknown (no scopes)
	 *
	 * `advance` controls whether we move to the next card. Set to `false`
	 * for "save but stay" flows (e.g. Cmd+Enter when you want to keep
	 * editing the same route, e.g. to add ANY-group scopes iteratively).
	 */
	const commit = useCallback(
		(
			kind: "decided" | "skip" | "unknown" = "decided",
			advance = true,
		) => {
			if (!current) return;
			const key = rowKey(current);

			if (kind !== "decided") {
				setDecisions((d) => ({
					...d,
					[key]: {
						decision: kind,
						scopes: [],
						shape: "array",
						note: draft.note,
						decidedAt: new Date().toISOString(),
					},
				}));
			} else {
				const scopes: ScopeString[] = [];
				// Meta scopes (superuser / admin) — route-standalone ok
				for (const m of draft.meta) scopes.push(m);
				// Resource R/W scopes
				if (draft.resource && draft.actions.size > 0) {
					for (const a of draft.actions) {
						if (draft.resource === "analytics" && a === "write") continue;
						scopes.push(`${draft.resource}:${a}` as ScopeString);
					}
				}
				if (scopes.length === 0) return;
				setDecisions((d) => ({
					...d,
					[key]: {
						decision: "decided",
						scopes,
						shape: draft.shape,
						note: draft.note || undefined,
						decidedAt: new Date().toISOString(),
					},
				}));
			}
			if (advance) {
				setIndex((i) => Math.min(filtered.length - 1, i + 1));
			}
		},
		[current, draft, filtered.length],
	);

	const del = useCallback(() => {
		if (!current) return;
		const key = rowKey(current);
		setDecisions((d) => {
			const next = { ...d };
			delete next[key];
			return next;
		});
	}, [current]);

	// Keyboard handlers
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tgt = e.target as HTMLElement;
			if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) {
				if (e.key === "Escape") {
					(tgt as HTMLElement).blur();
					e.preventDefault();
				}
				return;
			}
			// Cmd/Ctrl+Enter: save but stay on the same card (useful for
			// iteratively adding extra scopes to the same route).
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				commit("decided", false);
				e.preventDefault();
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			// Resource keys 1-9
			if (RESOURCE_KEYS[e.key]) {
				setResource(RESOURCE_KEYS[e.key]);
				e.preventDefault();
				return;
			}
			switch (e.key) {
				case "r":
					toggleAction("read");
					e.preventDefault();
					break;
				case "w":
					toggleAction("write");
					e.preventDefault();
					break;
				// Meta-scopes — uppercase to distinguish from `s` (skip) / `a` (unused)
				case "S":
					toggleMeta("superuser");
					e.preventDefault();
					break;
				case "O":
					toggleMeta("owner");
					e.preventDefault();
					break;
				case "A":
					toggleMeta("admin");
					e.preventDefault();
					break;
				case "P":
					toggleMeta("public");
					e.preventDefault();
					break;
				case "Enter":
					commit("decided");
					e.preventDefault();
					break;
				case "s":
					commit("skip");
					e.preventDefault();
					break;
				case "u":
					commit("unknown");
					e.preventDefault();
					break;
				case "ArrowRight":
				case "j":
					setIndex((i) => Math.min(filtered.length - 1, i + 1));
					e.preventDefault();
					break;
				case "ArrowLeft":
				case "k":
					setIndex((i) => Math.max(0, i - 1));
					e.preventDefault();
					break;
				case "d":
					del();
					e.preventDefault();
					break;
				case "/":
					searchRef.current?.focus();
					e.preventDefault();
					break;
				case "?":
					alert(HELP_TEXT);
					e.preventDefault();
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggleAction, toggleMeta, setResource, commit, del, filtered.length]);

	const decidedCount = useMemo(
		() => Object.values(decisions).filter((d) => d.decision === "decided").length,
		[decisions],
	);
	const skippedCount = useMemo(
		() => Object.values(decisions).filter((d) => d.decision === "skip" || d.decision === "unknown").length,
		[decisions],
	);
	const total = allRoutes.length;
	const percent = Math.round((decidedCount / total) * 100);

	return (
		<div
			style={{
				minHeight: "100vh",
				backgroundColor: "#0a0a0a",
				color: "#e5e5e5",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				padding: "16px",
				boxSizing: "border-box",
			}}
		>
			{/* Top bar */}
			<div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
				<div style={{ fontWeight: 700, fontSize: "16px" }}>Scope Picker</div>
				<div style={{ opacity: 0.65, fontSize: "12px" }}>
					{decidedCount}/{total} decided · {skippedCount} skipped · {percent}%
				</div>
				<div style={{ flex: 1, height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
					<div
						style={{
							width: `${percent}%`,
							height: "100%",
							background: "#8838ff",
							transition: "width 150ms linear",
						}}
					/>
				</div>
				<span style={{ fontSize: "11px", opacity: 0.6 }}>
					{saveState === "saving" && "saving…"}
					{saveState === "saved" && "saved ✓"}
					{saveState === "error" && "save error (falling back to localStorage)"}
				</span>
				<button
					type="button"
					onClick={() => alert(HELP_TEXT)}
					style={pillStyle(false)}
				>
					? help
				</button>
			</div>

			{/* Filter bar */}
			<div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
				<input
					ref={searchRef}
					value={filterQ}
					onChange={(e) => setFilterQ(e.target.value)}
					placeholder="search path/handler (/)"
					style={{
						flex: "1 0 200px",
						background: "#111",
						border: "1px solid #2a2a2a",
						color: "#eee",
						padding: "8px 10px",
						borderRadius: "6px",
						fontFamily: "inherit",
						fontSize: "12px",
					}}
				/>
				<select
					value={filterGroup}
					onChange={(e) => setFilterGroup(e.target.value)}
					style={selectStyle}
				>
					{groups.map((g) => (
						<option key={g} value={g}>
							{g === "all" ? "all groups" : g}
						</option>
					))}
				</select>
				<select
					value={filterResource}
					onChange={(e) => setFilterResource(e.target.value as Resource | "all")}
					style={selectStyle}
				>
					<option value="all">all resources</option>
					{RESOURCES.map((r) => (
						<option key={r} value={r}>
							{r}
						</option>
					))}
				</select>
				<label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", opacity: 0.85 }}>
					<input
						type="checkbox"
						checked={showDecided}
						onChange={(e) => setShowDecided(e.target.checked)}
					/>
					show decided
				</label>
				<div style={{ fontSize: "12px", opacity: 0.55 }}>
					{filtered.length} shown · pos {filtered.length === 0 ? 0 : index + 1}/{filtered.length}
				</div>
			</div>

			{/* Card */}
			{current ? (
				<Card
					route={current}
					existing={decisions[rowKey(current)]}
					draft={draft}
					setDraft={setDraft}
					setResource={setResource}
					toggleAction={toggleAction}
					toggleMeta={toggleMeta}
					commit={commit}
					del={del}
				/>
			) : (
				<div style={{ padding: "40px", textAlign: "center", opacity: 0.6 }}>
					no routes match this filter 🎉 — or you finished them all
				</div>
			)}

			{/* Context: surrounding siblings (parent group) */}
			{current && <ParentGroup current={current} decisions={decisions} filtered={filtered} setIndex={setIndex} index={index} />}
		</div>
	);
}

const selectStyle: React.CSSProperties = {
	background: "#111",
	border: "1px solid #2a2a2a",
	color: "#eee",
	padding: "8px 10px",
	borderRadius: "6px",
	fontFamily: "inherit",
	fontSize: "12px",
};

function pillStyle(active: boolean): React.CSSProperties {
	return {
		background: active ? "#8838ff" : "#1a1a1a",
		border: `1px solid ${active ? "#8838ff" : "#2a2a2a"}`,
		color: active ? "#fff" : "#ccc",
		padding: "6px 10px",
		borderRadius: "6px",
		fontFamily: "inherit",
		fontSize: "12px",
		cursor: "pointer",
	};
}

function Card({
	route,
	existing,
	draft,
	setDraft,
	setResource,
	toggleAction,
	toggleMeta,
	commit,
	del,
}: {
	route: RouteRow;
	existing: Decision | undefined;
	draft: {
		resource: Resource | null;
		actions: Set<Action>;
		meta: Set<MetaScope>;
		note: string;
		shape: Shape;
	};
	setDraft: (fn: (d: typeof draft) => typeof draft) => void;
	setResource: (r: Resource) => void;
	toggleAction: (a: Action) => void;
	toggleMeta: (m: MetaScope) => void;
	commit: (kind?: "decided" | "skip" | "unknown", advance?: boolean) => void;
	del: () => void;
}) {
	const methodColor: Record<string, string> = {
		GET: "#22c55e",
		POST: "#3b82f6",
		PUT: "#eab308",
		PATCH: "#a855f7",
		DELETE: "#ef4444",
		ALL: "#64748b",
	};

	return (
		<div
			style={{
				background: "#111",
				border: "1px solid #2a2a2a",
				borderRadius: "12px",
				padding: "20px",
				display: "grid",
				gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
				gap: "20px",
			}}
		>
			<div>
				<div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
					<span
						style={{
							background: methodColor[route.method] ?? "#64748b",
							color: "#0a0a0a",
							padding: "3px 8px",
							borderRadius: "4px",
							fontWeight: 700,
							fontSize: "11px",
							letterSpacing: "0.5px",
						}}
					>
						{route.method}
					</span>
					<span
						style={{
							background: "#1a1a1a",
							border: "1px solid #333",
							padding: "3px 6px",
							borderRadius: "4px",
							fontSize: "10px",
							opacity: 0.75,
						}}
					>
						{route.style}
					</span>
					<span
						style={{
							background: "#1a1a1a",
							border: "1px solid #333",
							padding: "3px 6px",
							borderRadius: "4px",
							fontSize: "10px",
							opacity: 0.75,
						}}
					>
						{route.group}
					</span>
					{existing?.decision === "decided" && (
						<span style={{ color: "#22c55e", fontSize: "11px" }}>✓ decided</span>
					)}
					{existing?.decision === "skip" && <span style={{ color: "#eab308", fontSize: "11px" }}>⏩ skipped</span>}
					{existing?.decision === "unknown" && (
						<span style={{ color: "#94a3b8", fontSize: "11px" }}>❓ unknown</span>
					)}
				</div>
				<div style={{ fontSize: "20px", fontWeight: 600, wordBreak: "break-all" }}>{route.path}</div>
				<div style={{ opacity: 0.7, fontSize: "13px", marginTop: "6px" }}>{route.handlerName}</div>
				<div style={{ opacity: 0.45, fontSize: "11px", marginTop: "2px" }}>
					{route.handlerFile ?? "(plain handler, no createRoute)"}
				</div>
				<div style={{ opacity: 0.45, fontSize: "11px", marginTop: "2px" }}>
					mount: {route.mountChain.join(" → ")} · router: {route.sourceRouterFile}
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Resource (1-9)
					</div>
					<div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
						{RESOURCES.map((r, i) => (
							<button
								key={r}
								type="button"
								onClick={() => setResource(r)}
								style={{
									...pillStyle(draft.resource === r),
									borderColor: draft.resource === r ? RESOURCE_COLORS[r] : "#2a2a2a",
									background: draft.resource === r ? RESOURCE_COLORS[r] : "#1a1a1a",
									color: draft.resource === r ? "#0a0a0a" : "#ccc",
									fontWeight: draft.resource === r ? 700 : 400,
								}}
							>
								{i + 1} · {r}
							</button>
						))}
					</div>
				</div>

				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Actions
					</div>
					<div style={{ display: "flex", gap: "6px" }}>
						<button type="button" onClick={() => toggleAction("read")} style={pillStyle(draft.actions.has("read"))}>
							r · read
						</button>
						<button
							type="button"
							onClick={() => toggleAction("write")}
							style={pillStyle(draft.actions.has("write"))}
							disabled={draft.resource === "analytics"}
							title={draft.resource === "analytics" ? "analytics is read-only" : ""}
						>
							w · write
						</button>
					</div>
					<div style={{ fontSize: "10px", opacity: 0.5, marginTop: "4px" }}>
						write implies read at check time — you don't need both selected
					</div>
				</div>

				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Meta scopes
					</div>
					<div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => toggleMeta("superuser")}
							style={{
								...pillStyle(draft.meta.has("superuser")),
								borderColor: draft.meta.has("superuser") ? "#f59e0b" : "#2a2a2a",
								background: draft.meta.has("superuser") ? "#f59e0b" : "#1a1a1a",
								color: draft.meta.has("superuser") ? "#0a0a0a" : "#ccc",
								fontWeight: draft.meta.has("superuser") ? 700 : 400,
							}}
							title="Autumn-staff-only. Use for /admin/* routes. (keybind: S)"
						>
							S · superuser
						</button>
						<button
							type="button"
							onClick={() => toggleMeta("owner")}
							style={{
								...pillStyle(draft.meta.has("owner")),
								borderColor: draft.meta.has("owner") ? "#a855f7" : "#2a2a2a",
								background: draft.meta.has("owner") ? "#a855f7" : "#1a1a1a",
								color: draft.meta.has("owner") ? "#0a0a0a" : "#ccc",
								fontWeight: draft.meta.has("owner") ? 700 : 400,
							}}
							title="Org owner only. Use for destructive owner-gated actions (delete org, transfer ownership). (keybind: O)"
						>
							O · owner
						</button>
						<button
							type="button"
							onClick={() => toggleMeta("admin")}
							style={{
								...pillStyle(draft.meta.has("admin")),
								borderColor: draft.meta.has("admin") ? "#ef4444" : "#2a2a2a",
								background: draft.meta.has("admin") ? "#ef4444" : "#1a1a1a",
								color: draft.meta.has("admin") ? "#0a0a0a" : "#ccc",
								fontWeight: draft.meta.has("admin") ? 700 : 400,
							}}
							title="Universal bypass. Rarely needed on routes — most routes should have R/W scopes. (keybind: A)"
						>
							A · admin
						</button>
						<button
							type="button"
							onClick={() => toggleMeta("public")}
							style={{
								...pillStyle(draft.meta.has("public")),
								borderColor: draft.meta.has("public") ? "#10b981" : "#2a2a2a",
								background: draft.meta.has("public") ? "#10b981" : "#1a1a1a",
								color: draft.meta.has("public") ? "#0a0a0a" : "#ccc",
								fontWeight: draft.meta.has("public") ? 700 : 400,
							}}
							title="No scopes required. Use for unauthenticated endpoints (checkout links, hosted redirects) or authed-but-ungated routes (feedback, flags). (keybind: P)"
						>
							P · public
						</button>
					</div>
					<div style={{ fontSize: "10px", opacity: 0.5, marginTop: "4px" }}>
						superuser → Autumn staff · owner → org owner only · admin → product bypass · public → no scopes required
					</div>
				</div>

				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Shape
					</div>
					<select
						value={draft.shape}
						onChange={(e) => setDraft((d) => ({ ...d, shape: e.target.value as Shape }))}
						style={selectStyle}
					>
						<option value="array">array · ALL required</option>
						<option value="all">{"{ ALL }"}</option>
						<option value="any">{"{ ANY }"}</option>
						<option value="any-and-all">{"{ ALL, ANY }"}</option>
					</select>
				</div>

				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Note (optional)
					</div>
					<input
						type="text"
						value={draft.note}
						onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
						placeholder="why, or anything tricky"
						style={{
							width: "100%",
							background: "#0c0c0c",
							border: "1px solid #2a2a2a",
							color: "#eee",
							padding: "8px 10px",
							borderRadius: "6px",
							fontFamily: "inherit",
							fontSize: "12px",
							boxSizing: "border-box",
						}}
					/>
				</div>

				<div>
					<div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Preview
					</div>
					<code style={{ fontSize: "12px", background: "#0c0c0c", padding: "8px 10px", display: "block", borderRadius: "6px", whiteSpace: "pre-wrap" }}>
						{renderPreview(draft)}
					</code>
				</div>

				<div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
					<button type="button" onClick={() => commit("decided")} style={{ ...pillStyle(true), background: "#22c55e", borderColor: "#22c55e", color: "#0a0a0a", fontWeight: 700 }}>
						⏎ save + next
					</button>
					<button
						type="button"
						onClick={() => commit("decided", false)}
						style={{ ...pillStyle(true), background: "#0ea5e9", borderColor: "#0ea5e9", color: "#0a0a0a", fontWeight: 700 }}
						title="Save but stay on this card — useful for iteratively adding more scopes"
					>
						⌘⏎ save + stay
					</button>
					<button type="button" onClick={() => commit("skip")} style={pillStyle(false)}>
						s · skip
					</button>
					<button type="button" onClick={() => commit("unknown")} style={pillStyle(false)}>
						u · unknown
					</button>
					<button type="button" onClick={del} style={pillStyle(false)}>
						d · clear
					</button>
				</div>
			</div>
		</div>
	);
}

function renderPreview(draft: {
	resource: Resource | null;
	actions: Set<Action>;
	meta: Set<MetaScope>;
	shape: Shape;
}): string {
	const tokens: string[] = [];
	for (const m of draft.meta) {
		tokens.push(`Scopes.${cap(m)}`);
	}
	if (draft.resource && draft.actions.size > 0) {
		for (const a of draft.actions) {
			if (draft.resource === "analytics" && a === "write") continue;
			tokens.push(`Scopes.${cap(draft.resource)}.${cap(a)}`);
		}
	}
	if (tokens.length === 0) return "scopes: [ ??? ]";
	const arr = `[${tokens.join(", ")}]`;
	switch (draft.shape) {
		case "array":
			return `scopes: ${arr},`;
		case "all":
			return `scopes: { ALL: ${arr} },`;
		case "any":
			return `scopes: { ANY: ${arr} },`;
		case "any-and-all":
			return `scopes: { ALL: ${arr}, ANY: [/* ... */] },`;
	}
}

function cap(s: string) {
	if (s === "apiKeys") return "ApiKeys";
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function ParentGroup({
	current,
	decisions,
	filtered,
	setIndex,
	index,
}: {
	current: RouteRow;
	decisions: Record<string, Decision>;
	filtered: RouteRow[];
	setIndex: (n: number) => void;
	index: number;
}) {
	const siblings = useMemo(() => filtered.filter((r) => r.group === current.group), [filtered, current.group]);

	if (siblings.length <= 1) return null;

	return (
		<div style={{ marginTop: "16px" }}>
			<div style={{ fontSize: "11px", opacity: 0.55, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
				{current.group} — {siblings.length} routes in group
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
				{siblings.map((s) => {
					const d = decisions[rowKey(s)];
					const isCurrent = rowKey(s) === rowKey(current);
					const color = d?.decision === "decided" ? "#22c55e" : d?.decision === "skip" ? "#eab308" : d?.decision === "unknown" ? "#94a3b8" : "#333";
					const idxInFiltered = filtered.findIndex((r) => rowKey(r) === rowKey(s));
					return (
						<button
							type="button"
							key={rowKey(s)}
							onClick={() => idxInFiltered >= 0 && setIndex(idxInFiltered)}
							title={`${s.method} ${s.path}`}
							style={{
								padding: "4px 6px",
								fontSize: "10px",
								background: isCurrent ? "#8838ff" : "#111",
								border: `1px solid ${isCurrent ? "#8838ff" : color}`,
								color: isCurrent ? "#fff" : "#ccc",
								borderRadius: "4px",
								cursor: "pointer",
								fontFamily: "inherit",
							}}
						>
							{s.method} {s.path.length > 50 ? `…${s.path.slice(-48)}` : s.path}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const HELP_TEXT = `Keybinds:
  1-9, 0        pick resource (1=organisation ... 9=apiKeys, 0=platform)
  r             toggle read
  w             toggle write
  S             toggle superuser meta-scope (Autumn-staff-only routes — /admin/*)
  O             toggle owner meta-scope (org-owner-only destructive actions)
  A             toggle admin meta-scope (universal bypass; rare on routes)
  P             toggle public meta-scope (no scopes required; unauthenticated or authed-but-ungated)
  Enter         save + advance
  Cmd/Ctrl+⏎    save but stay on this card (for adding more scopes)
  s             skip
  u             unknown
  d             clear this row's decision
  → / j         next
  ← / k         prev
  /             focus search
  ?             this help
`;
