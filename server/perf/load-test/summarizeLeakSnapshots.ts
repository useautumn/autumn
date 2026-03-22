import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SNAPSHOTS_DIR = join(import.meta.dir, "../snapshots");
const DEFAULT_TOP = 40;
const DEFAULT_MIN_DELTA_BYTES = 10 * 1024;
const DEFAULT_MIN_DELTA_COUNT = 5;
const DEFAULT_RETAINER_CONSTRUCTORS = 3;
const DEFAULT_RETAINER_SAMPLES = 3;
const MAX_RETAINER_DEPTH = 12;

type CliOptions = {
	before?: string;
	after?: string;
	top: number;
	minDeltaBytes: number;
	minDeltaCount: number;
	retainerConstructors: number;
	retainerSamples: number;
	out?: string;
};

type HeapMeta = {
	node_fields: string[];
	node_types: Array<string[] | string>;
	edge_fields: string[];
	edge_types: Array<string[] | string>;
};

type HeapSnapshotJson = {
	snapshot: {
		meta: HeapMeta;
	};
	nodes: number[];
	edges: number[];
	strings: string[];
};

type NodeRecord = {
	index: number;
	type: string;
	name: string;
	id: number;
	selfSize: number;
	edgeCount: number;
	edgeStart: number;
	nodeOffset: number;
};

type GroupStats = {
	key: string;
	type: string;
	name: string;
	count: number;
	selfSize: number;
	maxSelfSize: number;
	nodeIndexes?: number[];
};

type SummaryRecord = {
	key: string;
	type: string;
	name: string;
	beforeCount: number;
	afterCount: number;
	deltaCount: number;
	beforeSelfSize: number;
	afterSelfSize: number;
	deltaSelfSize: number;
	avgBeforeSize: number;
	avgAfterSize: number;
};

type SnapshotAnalysis = {
	filePath: string;
	fileName: string;
	totalNodes: number;
	totalSelfSize: number;
	nodes: NodeRecord[];
	groups: Map<string, GroupStats>;
	incomingEdges?: IncomingEdge[][];
	strings: string[];
	rawEdges: number[];
	edgeFieldCount: number;
	nodeFieldCount: number;
	edgeTypeNames: string[];
	edgeTypeIndex: number;
	edgeNameOrIndexIndex: number;
	edgeToNodeIndex: number;
};

type IncomingEdge = {
	fromNodeIndex: number;
	edgeType: string;
	nameOrIndex: string;
};

type RetainerPathStep = {
	via: string;
	node: NodeRecord;
};

type RetainerPath = {
	sampleNode: NodeRecord;
	steps: RetainerPathStep[];
	terminatedAtRoot: boolean;
};

type OutgoingEdge = {
	fromNodeIndex: number;
	toNodeIndex: number;
	edgeType: string;
	nameOrIndex: string;
	toNode: NodeRecord;
};

type Uint8ArrayOwnership = {
	label: string;
	count: number;
	selfSize: number;
	sampleChains: string[];
};

type SocketBufferSummary = {
	socketIndex: number;
	socketId: number;
	classification: string;
	detail: string;
	newChunkCount: number;
	newChunkBytes: number;
	bufferChunkCount: number;
	bufferBytes: number;
	bufferNodeName?: string;
	sampleChain: string;
};

type Uint8ArrayAnalysis = {
	beforeCount: number;
	afterCount: number;
	deltaCount: number;
	beforeBytes: number;
	afterBytes: number;
	deltaBytes: number;
	newNodeCount: number;
	newNodeBytes: number;
	ownerRows: Array<Record<string, string>>;
	socketRows: Array<Record<string, string>>;
	sampleChains: string[];
	notes: string[];
};

const BYTE_UNITS = ["B", "KB", "MB", "GB"];

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = {
		top: DEFAULT_TOP,
		minDeltaBytes: DEFAULT_MIN_DELTA_BYTES,
		minDeltaCount: DEFAULT_MIN_DELTA_COUNT,
		retainerConstructors: DEFAULT_RETAINER_CONSTRUCTORS,
		retainerSamples: DEFAULT_RETAINER_SAMPLES,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];

		if (arg === "--before") {
			options.before = next;
			i++;
			continue;
		}

		if (arg === "--after") {
			options.after = next;
			i++;
			continue;
		}

		if (arg === "--top") {
			options.top = parsePositiveInt({ value: next, flag: arg });
			i++;
			continue;
		}

		if (arg === "--min-delta-bytes") {
			options.minDeltaBytes = parsePositiveInt({ value: next, flag: arg });
			i++;
			continue;
		}

		if (arg === "--min-delta-count") {
			options.minDeltaCount = parsePositiveInt({ value: next, flag: arg });
			i++;
			continue;
		}

		if (arg === "--retainer-constructors") {
			options.retainerConstructors = parsePositiveInt({ value: next, flag: arg });
			i++;
			continue;
		}

		if (arg === "--retainer-samples") {
			options.retainerSamples = parsePositiveInt({ value: next, flag: arg });
			i++;
			continue;
		}

		if (arg === "--out") {
			options.out = next;
			i++;
			continue;
		}

		if (arg === "--help") {
			printHelp();
			process.exit(0);
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function parsePositiveInt({ value, flag }: { value?: string; flag: string }) {
	if (!value) {
		throw new Error(`${flag} requires a value`);
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive integer`);
	}

	return parsed;
}

function printHelp() {
	console.log(`Usage: bun perf/load-test/summarizeLeakSnapshots.ts [options]

Options:
  --before <path>                Explicit before snapshot path
  --after <path>                 Explicit after snapshot path
  --top <n>                      Number of growing constructors to print (default: ${DEFAULT_TOP})
  --min-delta-bytes <n>          Minimum self-size growth in bytes (default: ${DEFAULT_MIN_DELTA_BYTES})
  --min-delta-count <n>          Minimum object count growth (default: ${DEFAULT_MIN_DELTA_COUNT})
  --retainer-constructors <n>    How many suspicious constructors get retainer chains (default: ${DEFAULT_RETAINER_CONSTRUCTORS})
  --retainer-samples <n>         How many sample nodes per constructor (default: ${DEFAULT_RETAINER_SAMPLES})
  --out <path>                   Optional markdown file output
  --help                         Show this help text
`);
}

function resolveSnapshotPaths({ before, after }: { before?: string; after?: string }) {
	if (before && after) {
		return { beforePath: before, afterPath: after };
	}

	const snapshots = readdirSync(SNAPSHOTS_DIR)
		.filter((entry) => entry.endsWith(".heapsnapshot"))
		.map((entry) => join(SNAPSHOTS_DIR, entry))
		.sort();

	if (snapshots.length < 2) {
		throw new Error(
			`Need at least two snapshots in ${SNAPSHOTS_DIR} or pass --before/--after explicitly`,
		);
	}

	return {
		beforePath: before ?? snapshots[snapshots.length - 2]!,
		afterPath: after ?? snapshots[snapshots.length - 1]!,
	};
}

function parseHeapSnapshot({
	filePath,
	includeIncomingEdges,
}: {
	filePath: string;
	includeIncomingEdges: boolean;
}): SnapshotAnalysis {
	const raw = readFileSync(filePath, "utf8");
	const parsed = JSON.parse(raw) as HeapSnapshotJson;
	const meta = parsed.snapshot.meta;
	const nodeFieldCount = meta.node_fields.length;
	const edgeFieldCount = meta.edge_fields.length;

	const nodeTypeIndex = meta.node_fields.indexOf("type");
	const nodeNameIndex = meta.node_fields.indexOf("name");
	const nodeIdIndex = meta.node_fields.indexOf("id");
	const nodeSelfSizeIndex = meta.node_fields.indexOf("self_size");
	const nodeEdgeCountIndex = meta.node_fields.indexOf("edge_count");
	const edgeTypeIndex = meta.edge_fields.indexOf("type");
	const edgeNameOrIndex = meta.edge_fields.indexOf("name_or_index");
	const edgeToNodeIndex = meta.edge_fields.indexOf("to_node");

	const nodeTypeNames = meta.node_types[nodeTypeIndex] as string[];
	const edgeTypeNames = meta.edge_types[edgeTypeIndex] as string[];
	const nodes: NodeRecord[] = [];
	const groups = new Map<string, GroupStats>();
	const incomingEdges: IncomingEdge[][] | undefined = includeIncomingEdges ? [] : undefined;

	let totalSelfSize = 0;
	let edgeOffset = 0;

	for (let nodeOffset = 0; nodeOffset < parsed.nodes.length; nodeOffset += nodeFieldCount) {
		const nodeIndex = nodeOffset / nodeFieldCount;
		const type = nodeTypeNames[parsed.nodes[nodeOffset + nodeTypeIndex]] ?? "unknown";
		const nameIndex = parsed.nodes[nodeOffset + nodeNameIndex] ?? 0;
		const name = parsed.strings[nameIndex] ?? "";
		const id = parsed.nodes[nodeOffset + nodeIdIndex] ?? 0;
		const selfSize = parsed.nodes[nodeOffset + nodeSelfSizeIndex] ?? 0;
		const edgeCount = parsed.nodes[nodeOffset + nodeEdgeCountIndex] ?? 0;

		const record: NodeRecord = {
			index: nodeIndex,
			type,
			name,
			id,
			selfSize,
			edgeCount,
			edgeStart: edgeOffset,
			nodeOffset,
		};

		nodes.push(record);
		totalSelfSize += selfSize;

		const key = `${type}:${name}`;
		const group =
			groups.get(key) ??
			({
				key,
				type,
				name,
				count: 0,
				selfSize: 0,
				maxSelfSize: 0,
				nodeIndexes: includeIncomingEdges ? [] : undefined,
			} satisfies GroupStats);

		group.count += 1;
		group.selfSize += selfSize;
		group.maxSelfSize = Math.max(group.maxSelfSize, selfSize);
		group.nodeIndexes?.push(nodeIndex);
		groups.set(key, group);

		if (incomingEdges) {
			incomingEdges[nodeIndex] = incomingEdges[nodeIndex] ?? [];
		}

		edgeOffset += edgeCount * edgeFieldCount;
	}

	if (incomingEdges) {
		for (const node of nodes) {
			for (
				let edgeOffsetIndex = node.edgeStart;
				edgeOffsetIndex < node.edgeStart + node.edgeCount * edgeFieldCount;
				edgeOffsetIndex += edgeFieldCount
			) {
				const edgeType =
					edgeTypeNames[parsed.edges[edgeOffsetIndex + edgeTypeIndex]] ?? "unknown";
				const nameOrIndexValue = parsed.edges[edgeOffsetIndex + edgeNameOrIndex] ?? 0;
				const toNodeOffset = parsed.edges[edgeOffsetIndex + edgeToNodeIndex] ?? 0;
				const toNodeIndex = toNodeOffset / nodeFieldCount;

				const edgeName = formatEdgeName({
					edgeType,
					nameOrIndexValue,
					strings: parsed.strings,
				});

				incomingEdges[toNodeIndex] = incomingEdges[toNodeIndex] ?? [];
				incomingEdges[toNodeIndex].push({
					fromNodeIndex: node.index,
					edgeType,
					nameOrIndex: edgeName,
				});
			}
		}
	}

	return {
		filePath,
		fileName: basename(filePath),
		totalNodes: nodes.length,
		totalSelfSize,
		nodes,
		groups,
		incomingEdges,
		strings: parsed.strings,
		rawEdges: parsed.edges,
		edgeFieldCount,
		nodeFieldCount,
		edgeTypeNames,
		edgeTypeIndex,
		edgeNameOrIndexIndex: edgeNameOrIndex,
		edgeToNodeIndex,
	};
}

function getOutgoingEdges({
	snapshot,
	nodeIndex,
}: {
	snapshot: SnapshotAnalysis;
	nodeIndex: number;
}): OutgoingEdge[] {
	const node = snapshot.nodes[nodeIndex];
	if (!node) {
		return [];
	}

	const edges: OutgoingEdge[] = [];
	for (
		let edgeOffsetIndex = node.edgeStart;
		edgeOffsetIndex < node.edgeStart + node.edgeCount * snapshot.edgeFieldCount;
		edgeOffsetIndex += snapshot.edgeFieldCount
	) {
		const edgeType =
			snapshot.edgeTypeNames[
				snapshot.rawEdges[edgeOffsetIndex + snapshot.edgeTypeIndex]
			] ?? "unknown";
		const nameOrIndexValue =
			snapshot.rawEdges[edgeOffsetIndex + snapshot.edgeNameOrIndexIndex] ?? 0;
		const toNodeOffset =
			snapshot.rawEdges[edgeOffsetIndex + snapshot.edgeToNodeIndex] ?? 0;
		const toNodeIndex = toNodeOffset / snapshot.nodeFieldCount;
		const toNode = snapshot.nodes[toNodeIndex];

		if (!toNode) {
			continue;
		}

		edges.push({
			fromNodeIndex: nodeIndex,
			toNodeIndex,
			edgeType,
			nameOrIndex: formatEdgeName({
				edgeType,
				nameOrIndexValue,
				strings: snapshot.strings,
			}),
			toNode,
		});
	}

	return edges;
}

function getPropertyEdge({
	snapshot,
	nodeIndex,
	propertyName,
}: {
	snapshot: SnapshotAnalysis;
	nodeIndex: number;
	propertyName: string;
}) {
	return getOutgoingEdges({ snapshot, nodeIndex }).find(
		(edge) => edge.edgeType === "property" && edge.nameOrIndex === propertyName,
	);
}

function getStringProperty({
	snapshot,
	nodeIndex,
	propertyName,
}: {
	snapshot: SnapshotAnalysis;
	nodeIndex: number;
	propertyName: string;
}) {
	const edge = getPropertyEdge({ snapshot, nodeIndex, propertyName });
	return edge?.toNode.name?.trim() || undefined;
}

function getNodeLabel(node: NodeRecord) {
	return `${node.type}:${node.name || "(anonymous)"}`;
}

function analyzeUint8Arrays({
	before,
	after,
}: {
	before: SnapshotAnalysis;
	after: SnapshotAnalysis;
}): Uint8ArrayAnalysis | null {
	const beforeGroup = before.groups.get("object:Uint8Array");
	const afterGroup = after.groups.get("object:Uint8Array");
	if (!afterGroup?.nodeIndexes?.length) {
		return null;
	}

	const beforeIds = new Set(
		(beforeGroup?.nodeIndexes ?? []).map((nodeIndex) => before.nodes[nodeIndex]?.id),
	);
	const newUint8Nodes = afterGroup.nodeIndexes
		.map((nodeIndex) => after.nodes[nodeIndex])
		.filter((node): node is NodeRecord => Boolean(node))
		.filter((node) => !beforeIds.has(node.id));

	const ownerBuckets = new Map<string, Uint8ArrayOwnership>();
	const socketBuckets = new Map<number, SocketBufferSummary>();
	const sampleChains: string[] = [];

	for (const node of newUint8Nodes) {
		const owner = findUint8ArrayOwner({ snapshot: after, uint8NodeIndex: node.index });
		const bucket =
			ownerBuckets.get(owner.label) ??
			({
				label: owner.label,
				count: 0,
				selfSize: 0,
				sampleChains: [],
			} satisfies Uint8ArrayOwnership);

		bucket.count += 1;
		bucket.selfSize += node.selfSize;
		if (bucket.sampleChains.length < 2) {
			bucket.sampleChains.push(owner.chainText);
		}
		ownerBuckets.set(owner.label, bucket);

		if (sampleChains.length < 5) {
			sampleChains.push(owner.chainText);
		}

		if (owner.socketIndex !== undefined) {
			const socketSummary =
				socketBuckets.get(owner.socketIndex) ??
				buildSocketBufferSummary({ snapshot: after, socketIndex: owner.socketIndex });
			socketSummary.newChunkCount += 1;
			socketSummary.newChunkBytes += node.selfSize;
			socketBuckets.set(owner.socketIndex, socketSummary);
		}
	}

	const ownerRows = [...ownerBuckets.values()]
		.sort((left, right) => right.selfSize - left.selfSize)
		.slice(0, 10)
		.map((bucket) => ({
			Owner: bucket.label,
			Chunks: formatNumber(bucket.count),
			Bytes: formatUnsignedBytes(bucket.selfSize),
			Example: bucket.sampleChains[0] ?? "",
		}));

	const socketRows = [...socketBuckets.values()]
		.sort((left, right) => right.newChunkBytes - left.newChunkBytes)
		.slice(0, 8)
		.map((socket) => ({
			Socket: `${socket.classification} (#${socket.socketId})`,
			Host: socket.detail,
			"New Chunks": formatNumber(socket.newChunkCount),
			"New Bytes": formatUnsignedBytes(socket.newChunkBytes),
			"Full Buffer": `${formatNumber(socket.bufferChunkCount)} / ${formatUnsignedBytes(socket.bufferBytes)}`,
		}));

	const notes = buildUint8ArrayNotes({
		ownerBuckets,
		socketBuckets,
		newNodeCount: newUint8Nodes.length,
	});

	return {
		beforeCount: beforeGroup?.count ?? 0,
		afterCount: afterGroup.count,
		deltaCount: afterGroup.count - (beforeGroup?.count ?? 0),
		beforeBytes: beforeGroup?.selfSize ?? 0,
		afterBytes: afterGroup.selfSize,
		deltaBytes: afterGroup.selfSize - (beforeGroup?.selfSize ?? 0),
		newNodeCount: newUint8Nodes.length,
		newNodeBytes: newUint8Nodes.reduce((sum, current) => sum + current.selfSize, 0),
		ownerRows,
		socketRows,
		sampleChains,
		notes,
	};
}

function findUint8ArrayOwner({
	snapshot,
	uint8NodeIndex,
}: {
	snapshot: SnapshotAnalysis;
	uint8NodeIndex: number;
}) {
	const queue: Array<{ nodeIndex: number; chain: string[] }> = [
		{ nodeIndex: uint8NodeIndex, chain: [getNodeLabel(snapshot.nodes[uint8NodeIndex]!)] },
	];
	const visited = new Set<number>([uint8NodeIndex]);
	let bestFallback = `direct parents of ${getNodeLabel(snapshot.nodes[uint8NodeIndex]!)}`;

	while (queue.length > 0) {
		const current = queue.shift()!;
		const inbound = snapshot.incomingEdges?.[current.nodeIndex] ?? [];

		for (const edge of rankIncomingEdges(inbound)) {
			const fromNode = snapshot.nodes[edge.fromNodeIndex];
			if (!fromNode || visited.has(fromNode.index)) {
				continue;
			}

			const chain = [
				...current.chain,
				`${edge.edgeType}:${edge.nameOrIndex} <- ${getNodeLabel(fromNode)}`,
			];

			if (fromNode.name === "Socket") {
				const socket = buildSocketBufferSummary({
					snapshot,
					socketIndex: fromNode.index,
				});

				return {
					label: `socket:${socket.classification}`,
					chainText: chain.join(" -> "),
					socketIndex: fromNode.index,
				};
			}

			if (isInterestingUint8Owner(fromNode)) {
				return {
					label: `${fromNode.name || fromNode.type}`,
					chainText: chain.join(" -> "),
				};
			}

			if (fromNode.type === "array" || fromNode.name === "Object") {
				bestFallback = getNodeLabel(fromNode);
			}

			if (chain.length < 10) {
				visited.add(fromNode.index);
				queue.push({ nodeIndex: fromNode.index, chain });
			}
		}
	}

	return {
		label: bestFallback,
		chainText: bestFallback,
	};
}

function isInterestingUint8Owner(node: NodeRecord) {
	return (
		node.name === "NativeReadableStreamSource" ||
		node.name === "TLSSocket" ||
		node.name === "IncomingMessage" ||
		node.name === "Request" ||
		node.name === "NodeHTTPResponse" ||
		node.name === "FetchHttpClient" ||
		node.name === "BufferList" ||
		node.name === "ArrayBuffer"
	);
}

function buildSocketBufferSummary({
	snapshot,
	socketIndex,
}: {
	snapshot: SnapshotAnalysis;
	socketIndex: number;
}): SocketBufferSummary {
	const socket = snapshot.nodes[socketIndex]!;
	const socketMeta = classifySocket({ snapshot, socketIndex });
	const bufferStats = inspectSocketBuffer({ snapshot, socketIndex });

	return {
		socketIndex,
		socketId: socket.id,
		classification: socketMeta.classification,
		detail: socketMeta.detail,
		newChunkCount: 0,
		newChunkBytes: 0,
		bufferChunkCount: bufferStats.chunkCount,
		bufferBytes: bufferStats.totalChunkBytes,
		bufferNodeName: bufferStats.bufferNodeName,
		sampleChain: socketMeta.sampleChain,
	};
}

function classifySocket({
	snapshot,
	socketIndex,
}: {
	snapshot: SnapshotAnalysis;
	socketIndex: number;
}) {
	const host = getStringProperty({ snapshot, nodeIndex: socketIndex, propertyName: "_host" });
	const ssl = getStringProperty({ snapshot, nodeIndex: socketIndex, propertyName: "ssl" });
	const handle = getPropertyEdge({ snapshot, nodeIndex: socketIndex, propertyName: "handle" });
	const request = getPropertyEdge({
		snapshot,
		nodeIndex: socketIndex,
		propertyName: "request",
	});
	const server = getPropertyEdge({ snapshot, nodeIndex: socketIndex, propertyName: "server" });

	if (host?.includes("psdb.cloud") || host?.includes("planetscale")) {
		return {
			classification: "outbound-db",
			detail: [host, ssl].filter(Boolean).join(" | ") || host,
			sampleChain: `_host=${host}`,
		};
	}

	if (host?.includes("stripe")) {
		return {
			classification: "outbound-stripe",
			detail: host,
			sampleChain: `_host=${host}`,
		};
	}

	if (
		handle?.toNode.name === "NodeHTTPServerSocket" ||
		request?.toNode.name === "IncomingMessage" ||
		server?.toNode.name === "Server"
	) {
		return {
			classification: "inbound-server",
			detail: [handle?.toNode.name, request?.toNode.name, server?.toNode.name]
				.filter(Boolean)
				.join(" | "),
			sampleChain: "handle/request/server inbound chain",
		};
	}

	if (host) {
		return {
			classification: "outbound-other",
			detail: host,
			sampleChain: `_host=${host}`,
		};
	}

	return {
		classification: "socket-unknown",
		detail: [handle?.toNode.name, request?.toNode.name, server?.toNode.name]
			.filter(Boolean)
			.join(" | ") || "unclassified socket",
		sampleChain: "socket classification unknown",
	};
}

function inspectSocketBuffer({
	snapshot,
	socketIndex,
}: {
	snapshot: SnapshotAnalysis;
	socketIndex: number;
}) {
	const readableState = getPropertyEdge({
		snapshot,
		nodeIndex: socketIndex,
		propertyName: "_readableState",
	});
	if (!readableState) {
		return { chunkCount: 0, totalChunkBytes: 0, bufferNodeName: undefined };
	}

	const bufferEdge = getPropertyEdge({
		snapshot,
		nodeIndex: readableState.toNodeIndex,
		propertyName: "buffer",
	});
	if (!bufferEdge) {
		return { chunkCount: 0, totalChunkBytes: 0, bufferNodeName: undefined };
	}

	const uint8Descendants = collectDescendantUint8Arrays({
		snapshot,
		startNodeIndex: bufferEdge.toNodeIndex,
		maxDepth: 4,
	});

	return {
		chunkCount: uint8Descendants.length,
		totalChunkBytes: uint8Descendants.reduce(
			(sum, nodeIndex) => sum + (snapshot.nodes[nodeIndex]?.selfSize ?? 0),
			0,
		),
		bufferNodeName: getNodeLabel(bufferEdge.toNode),
	};
}

function collectDescendantUint8Arrays({
	snapshot,
	startNodeIndex,
	maxDepth,
}: {
	snapshot: SnapshotAnalysis;
	startNodeIndex: number;
	maxDepth: number;
}) {
	const results: number[] = [];
	const queue: Array<{ nodeIndex: number; depth: number }> = [
		{ nodeIndex: startNodeIndex, depth: 0 },
	];
	const visited = new Set<number>([startNodeIndex]);

	while (queue.length > 0) {
		const current = queue.shift()!;
		const node = snapshot.nodes[current.nodeIndex];
		if (!node) {
			continue;
		}

		if (node.type === "object" && node.name === "Uint8Array") {
			results.push(node.index);
			continue;
		}

		if (current.depth >= maxDepth) {
			continue;
		}

		for (const edge of getOutgoingEdges({ snapshot, nodeIndex: current.nodeIndex })) {
			if (!visited.has(edge.toNodeIndex)) {
				visited.add(edge.toNodeIndex);
				queue.push({ nodeIndex: edge.toNodeIndex, depth: current.depth + 1 });
			}
		}
	}

	return results;
}

function buildUint8ArrayNotes({
	ownerBuckets,
	socketBuckets,
	newNodeCount,
}: {
	ownerBuckets: Map<string, Uint8ArrayOwnership>;
	socketBuckets: Map<number, SocketBufferSummary>;
	newNodeCount: number;
}) {
	const notes: string[] = [];
	const socketTotals = [...socketBuckets.values()].reduce(
		(acc, socket) => {
			acc[socket.classification] =
				(acc[socket.classification] ?? 0) + socket.newChunkCount;
			return acc;
		},
		{} as Record<string, number>,
	);

	for (const [classification, chunkCount] of Object.entries(socketTotals).sort(
		(left, right) => right[1] - left[1],
	)) {
		notes.push(
			`${classification} sockets account for ${formatNumber(chunkCount)} of ${formatNumber(newNodeCount)} new Uint8Array nodes`,
		);
	}

	const topOwner = [...ownerBuckets.values()].sort(
		(left, right) => right.selfSize - left.selfSize,
	)[0];
	if (topOwner) {
		notes.push(
			`top Uint8Array owner bucket is ${topOwner.label} with ${formatUnsignedBytes(topOwner.selfSize)}`,
		);
	}

	if (notes.length === 0) {
		notes.push("no strong Uint8Array owner pattern detected");
	}

	return notes;
}

function formatEdgeName({
	edgeType,
	nameOrIndexValue,
	strings,
}: {
	edgeType: string;
	nameOrIndexValue: number;
	strings: string[];
}) {
	if (edgeType === "element" || edgeType === "hidden") {
		return `[${nameOrIndexValue}]`;
	}

	if (edgeType === "internal") {
		return strings[nameOrIndexValue] ? `{${strings[nameOrIndexValue]}}` : "{internal}";
	}

	if (edgeType === "shortcut" || edgeType === "property" || edgeType === "context") {
		return strings[nameOrIndexValue] ?? "(unknown)";
	}

	if (edgeType === "weak") {
		return strings[nameOrIndexValue] ? `weak:${strings[nameOrIndexValue]}` : "weak";
	}

	return String(nameOrIndexValue);
}

function buildSummaryRecords({
	before,
	after,
}: {
	before: SnapshotAnalysis;
	after: SnapshotAnalysis;
}): SummaryRecord[] {
	const keys = new Set([...before.groups.keys(), ...after.groups.keys()]);
	const records: SummaryRecord[] = [];

	for (const key of keys) {
		const beforeGroup = before.groups.get(key);
		const afterGroup = after.groups.get(key);
		const beforeCount = beforeGroup?.count ?? 0;
		const afterCount = afterGroup?.count ?? 0;
		const beforeSelfSize = beforeGroup?.selfSize ?? 0;
		const afterSelfSize = afterGroup?.selfSize ?? 0;
		const type = afterGroup?.type ?? beforeGroup?.type ?? "unknown";
		const name = afterGroup?.name ?? beforeGroup?.name ?? "";

		records.push({
			key,
			type,
			name,
			beforeCount,
			afterCount,
			deltaCount: afterCount - beforeCount,
			beforeSelfSize,
			afterSelfSize,
			deltaSelfSize: afterSelfSize - beforeSelfSize,
			avgBeforeSize: beforeCount > 0 ? beforeSelfSize / beforeCount : 0,
			avgAfterSize: afterCount > 0 ? afterSelfSize / afterCount : 0,
		});
	}

	return records.sort((left, right) => {
		if (right.deltaSelfSize !== left.deltaSelfSize) {
			return right.deltaSelfSize - left.deltaSelfSize;
		}

		return right.deltaCount - left.deltaCount;
	});
}

function isInterestingGrowth({
	record,
	minDeltaBytes,
	minDeltaCount,
}: {
	record: SummaryRecord;
	minDeltaBytes: number;
	minDeltaCount: number;
}) {
	if (record.deltaCount <= 0 || record.deltaSelfSize <= 0) {
		return false;
	}

	return (
		record.deltaCount >= minDeltaCount || record.deltaSelfSize >= minDeltaBytes
	);
}

function selectSuspiciousConstructors({
	records,
	limit,
	minDeltaBytes,
	minDeltaCount,
}: {
	records: SummaryRecord[];
	limit: number;
	minDeltaBytes: number;
	minDeltaCount: number;
}) {
	return records
		.filter((record) => isInterestingGrowth({ record, minDeltaBytes, minDeltaCount }))
		.filter((record) => !shouldIgnoreConstructor(record))
		.slice(0, limit);
}

function shouldIgnoreConstructor(record: SummaryRecord) {
	const normalizedName = record.name.trim();
	if (!normalizedName) {
		return true;
	}

	return (
		normalizedName === "(system)" ||
		normalizedName === "(roots)" ||
		normalizedName === "(GC roots)" ||
		normalizedName === "(Internalized strings)"
	);
}

function formatBytes(bytes: number) {
	let value = Math.abs(bytes);
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const sign = bytes < 0 ? "-" : "+";
	const formatted = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${sign}${formatted} ${BYTE_UNITS[unitIndex]}`;
}

function formatUnsignedBytes(bytes: number) {
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("en-US").format(value);
}

function renderTable(records: SummaryRecord[]) {
	const rows = records.map((record) => ({
		Group: `${record.type}:${record.name}`,
		"Count D": signedNumber(record.deltaCount),
		"Self Size D": formatBytes(record.deltaSelfSize),
		Before: formatNumber(record.beforeCount),
		After: formatNumber(record.afterCount),
		"Avg After": formatUnsignedBytes(Math.round(record.avgAfterSize)),
	}));

	return renderAsciiTable(rows);
}

function renderGenericTable(rows: Array<Record<string, string>>) {
	return renderAsciiTable(rows);
}

function signedNumber(value: number) {
	return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function renderAsciiTable(rows: Array<Record<string, string>>) {
	if (rows.length === 0) {
		return "(no rows)";
	}

	const columns = Object.keys(rows[0]);
	const widths = columns.map((column) => {
		const cellWidth = Math.max(
			column.length,
			...rows.map((row) => String(row[column] ?? "").length),
		);
		return Math.min(cellWidth, 72);
	});

	const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+") }+`;
	const header = `| ${columns
		.map((column, index) => padCell({ value: column, width: widths[index] }))
		.join(" | ")} |`;
	const body = rows.map(
		(row) =>
			`| ${columns
				.map((column, index) =>
					padCell({ value: String(row[column] ?? ""), width: widths[index] }),
				)
				.join(" | ")} |`,
	);

	return [border, header, border, ...body, border].join("\n");
}

function padCell({ value, width }: { value: string; width: number }) {
	const trimmed = value.length > width ? `${value.slice(0, width - 1)}…` : value;
	return `${trimmed}${" ".repeat(Math.max(0, width - trimmed.length))}`;
}

function summarizeByType({
	records,
	types,
	limit,
}: {
	records: SummaryRecord[];
	types: string[];
	limit: number;
}) {
	return records
		.filter((record) => types.includes(record.type))
		.filter((record) => record.deltaCount > 0 || record.deltaSelfSize > 0)
		.slice(0, limit);
}

function buildRetainerPaths({
	after,
	record,
	sampleLimit,
}: {
	after: SnapshotAnalysis;
	record: SummaryRecord;
	sampleLimit: number;
}): RetainerPath[] {
	const group = after.groups.get(record.key);
	if (!group?.nodeIndexes?.length || !after.incomingEdges) {
		return [];
	}

	const samples = group.nodeIndexes
		.map((nodeIndex) => after.nodes[nodeIndex])
		.filter(Boolean)
		.sort((left, right) => right.selfSize - left.selfSize)
		.slice(0, sampleLimit);

	return samples.map((sampleNode) =>
		findRetainerPath({
			nodes: after.nodes,
			incomingEdges: after.incomingEdges!,
			targetNodeIndex: sampleNode.index,
		}),
	);
}

function findRetainerPath({
	nodes,
	incomingEdges,
	targetNodeIndex,
}: {
	nodes: NodeRecord[];
	incomingEdges: IncomingEdge[][];
	targetNodeIndex: number;
}): RetainerPath {
	const queue: Array<{ nodeIndex: number; path: RetainerPathStep[] }> = [
		{ nodeIndex: targetNodeIndex, path: [] },
	];
	const visited = new Set<number>([targetNodeIndex]);
	const sampleNode = nodes[targetNodeIndex];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const inbound = incomingEdges[current.nodeIndex] ?? [];

		for (const edge of rankIncomingEdges(inbound)) {
			const fromNode = nodes[edge.fromNodeIndex];
			if (!fromNode || visited.has(fromNode.index)) {
				continue;
			}

			const nextPath = [
				...current.path,
				{ via: formatRetainerStep(edge, fromNode), node: fromNode },
			];

			if (fromNode.type === "synthetic" || nextPath.length >= MAX_RETAINER_DEPTH) {
				return {
					sampleNode,
					steps: nextPath,
					terminatedAtRoot: fromNode.type === "synthetic",
				};
			}

			visited.add(fromNode.index);
			queue.push({ nodeIndex: fromNode.index, path: nextPath });
		}
	}

	return {
		sampleNode,
		steps: [],
		terminatedAtRoot: false,
	};
}

function rankIncomingEdges(edges: IncomingEdge[]) {
	return [...edges].sort((left, right) => {
		const leftScore = incomingEdgeScore(left);
		const rightScore = incomingEdgeScore(right);
		if (rightScore !== leftScore) {
			return rightScore - leftScore;
		}

		return left.nameOrIndex.localeCompare(right.nameOrIndex);
	});
}

function incomingEdgeScore(edge: IncomingEdge) {
	if (edge.edgeType === "property") {
		return 5;
	}

	if (edge.edgeType === "context") {
		return 4;
	}

	if (edge.edgeType === "internal") {
		return 3;
	}

	if (edge.edgeType === "element") {
		return 2;
	}

	if (edge.edgeType === "hidden") {
		return 1;
	}

	return 0;
}

function formatRetainerStep(edge: IncomingEdge, node: NodeRecord) {
	return `${edge.edgeType}:${edge.nameOrIndex} <- ${node.type}:${node.name || "(anonymous)"}`;
}

function renderRetainerPaths({
	record,
	paths,
}: {
	record: SummaryRecord;
	paths: RetainerPath[];
}) {
	const lines = [`${record.type}:${record.name}`];

	if (paths.length === 0) {
		lines.push("  No sample nodes available for retainer-chain extraction.");
		return lines.join("\n");
	}

	for (const [index, path] of paths.entries()) {
		lines.push(
			`  Sample ${index + 1}: id=${path.sampleNode.id}, self=${formatUnsignedBytes(path.sampleNode.selfSize)}`,
		);

		if (path.steps.length === 0) {
			lines.push("    - No inbound retainer path found within depth limit.");
			continue;
		}

		for (const step of path.steps) {
			lines.push(`    - ${step.via}`);
		}

		if (!path.terminatedAtRoot) {
			lines.push("    - Path truncated before reaching a synthetic GC root.");
		}
	}

	return lines.join("\n");
}

function renderSection({ title, body }: { title: string; body: string }) {
	return [`${title}`, "=".repeat(title.length), body].join("\n");
}

function renderAnalysis({
	before,
	after,
	records,
	interestingRecords,
	retainerSections,
	uint8ArrayAnalysis,
}: {
	before: SnapshotAnalysis;
	after: SnapshotAnalysis;
	records: SummaryRecord[];
	interestingRecords: SummaryRecord[];
	retainerSections: string[];
	uint8ArrayAnalysis: Uint8ArrayAnalysis | null;
}) {
	const overallDeltaBytes = after.totalSelfSize - before.totalSelfSize;
	const overallDeltaNodes = after.totalNodes - before.totalNodes;
	const topClosures = summarizeByType({
		records,
		types: ["closure"],
		limit: 10,
	});
	const topCollections = summarizeByType({
		records,
		types: ["object", "array"],
		limit: 10,
	}).filter((record) => /map|set|array|cache|list|queue/i.test(record.name));

	const notes = interestingRecords.slice(0, 5).map((record, index) => {
		const growthSignals = [
			record.deltaCount > 0 ? `${signedNumber(record.deltaCount)} objects` : null,
			record.deltaSelfSize > 0 ? `${formatBytes(record.deltaSelfSize)} self size` : null,
		]
			.filter(Boolean)
			.join(", ");

		return `${index + 1}. ${record.type}:${record.name} keeps growing after cooldown (${growthSignals})`;
	});

	const lines = [
		renderSection({
			title: "Heap Snapshot Diff Summary",
			body: [
				`before: ${before.filePath}`,
				`after:  ${after.filePath}`,
			].join("\n"),
		}),
		renderSection({
			title: "Snapshot Totals",
			body: [
				`before nodes:    ${formatNumber(before.totalNodes)}`,
				`after nodes:     ${formatNumber(after.totalNodes)}`,
				`node delta:      ${signedNumber(overallDeltaNodes)}`,
				`before self size:${formatUnsignedBytes(before.totalSelfSize)}`,
				`after self size: ${formatUnsignedBytes(after.totalSelfSize)}`,
				`self size delta: ${formatBytes(overallDeltaBytes)}`,
			].join("\n"),
		}),
		renderSection({
			title: "Top Growing Constructors",
			body:
				interestingRecords.length > 0
					? renderTable(interestingRecords)
					: "No growing constructors met the configured thresholds.",
		}),
		renderSection({
			title: "Closure Growth",
			body:
				topClosures.length > 0 ? renderTable(topClosures) : "No closure growth stood out.",
		}),
		renderSection({
			title: "Collection-Like Growth",
			body:
				topCollections.length > 0
					? renderTable(topCollections)
					: "No array/map/set/cache-like growth stood out.",
		}),
		renderSection({
			title: "Uint8Array Ownership",
			body: uint8ArrayAnalysis
				? [
					`before count:    ${formatNumber(uint8ArrayAnalysis.beforeCount)}`,
					`after count:     ${formatNumber(uint8ArrayAnalysis.afterCount)}`,
					`delta count:     ${signedNumber(uint8ArrayAnalysis.deltaCount)}`,
					`before self size:${formatUnsignedBytes(uint8ArrayAnalysis.beforeBytes)}`,
					`after self size: ${formatUnsignedBytes(uint8ArrayAnalysis.afterBytes)}`,
					`delta self size: ${formatBytes(uint8ArrayAnalysis.deltaBytes)}`,
					`new after-only Uint8Arrays: ${formatNumber(uint8ArrayAnalysis.newNodeCount)} (${formatUnsignedBytes(uint8ArrayAnalysis.newNodeBytes)})`,
					"",
					"Top owners of new Uint8Arrays",
					uint8ArrayAnalysis.ownerRows.length > 0
						? renderGenericTable(uint8ArrayAnalysis.ownerRows)
						: "No owner rows.",
					"",
					"Top sockets retaining Uint8Arrays",
					uint8ArrayAnalysis.socketRows.length > 0
						? renderGenericTable(uint8ArrayAnalysis.socketRows)
						: "No socket-owned Uint8Array buffers found.",
					"",
					"Representative chains",
					...(uint8ArrayAnalysis.sampleChains.length > 0
						? uint8ArrayAnalysis.sampleChains.map((chain) => `- ${chain}`)
						: ["- No sample chains."]),
					"",
					"Notes",
					...uint8ArrayAnalysis.notes.map((note) => `- ${note}`),
				].join("\n")
				: "No Uint8Array nodes found in the after snapshot.",
		}),
		renderSection({
			title: "Likely Leak Candidates",
			body:
				notes.length > 0
					? notes.map((note) => `- ${note}`).join("\n")
					: "- No obvious leak candidates passed the thresholds.",
		}),
		renderSection({
			title: "Retainer Chain Samples",
			body:
				retainerSections.length > 0
					? retainerSections.join("\n\n")
					: "No retainer-chain samples were generated.",
		}),
		renderSection({
			title: "Notes For Coding Agent",
			body: [
				"- Prioritize constructors with both positive count delta and positive self-size delta after cooldown.",
				"- Closure growth usually points to retained request context, event listeners, timers, or unresolved async work.",
				"- Map/Set/Array growth often points to unbounded caches, registries, queues, or missing cleanup paths.",
				"- Retainer chains here are sampled reverse-reference paths from the after snapshot; they are directional clues, not full dominator-tree analysis.",
				"- Compare suspicious constructor names against long-lived singletons, request-scoped state, queue workers, listeners, and global caches.",
			].join("\n"),
		}),
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const options = parseArgs();
	const { beforePath, afterPath } = resolveSnapshotPaths({
		before: options.before,
		after: options.after,
	});

	console.log(`[snapshot-diff] Parsing before snapshot: ${beforePath}`);
	const before = parseHeapSnapshot({
		filePath: beforePath,
		includeIncomingEdges: false,
	});

	console.log(`[snapshot-diff] Parsing after snapshot: ${afterPath}`);
	const after = parseHeapSnapshot({
		filePath: afterPath,
		includeIncomingEdges: true,
	});

	console.log("[snapshot-diff] Comparing groups...");
	const records = buildSummaryRecords({ before, after });
	const interestingRecords = selectSuspiciousConstructors({
		records,
		limit: options.top,
		minDeltaBytes: options.minDeltaBytes,
		minDeltaCount: options.minDeltaCount,
	});

	console.log("[snapshot-diff] Building retainer-chain samples...");
	const retainerSections = interestingRecords
		.slice(0, options.retainerConstructors)
		.map((record) => {
			const paths = buildRetainerPaths({
				after,
				record,
				sampleLimit: options.retainerSamples,
			});

			return renderRetainerPaths({ record, paths });
		});

	console.log("[snapshot-diff] Analyzing Uint8Array ownership...");
	const uint8ArrayAnalysis = analyzeUint8Arrays({ before, after });

	const report = renderAnalysis({
		before,
		after,
		records,
		interestingRecords,
		retainerSections,
		uint8ArrayAnalysis,
	});

	console.log(report);

	if (options.out) {
		writeFileSync(options.out, report, "utf8");
		console.log(`[snapshot-diff] Wrote report to ${options.out}`);
	}
}

await main();
