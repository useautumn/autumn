export class WebsocketManager {
	public channels: Map<string, Set<WebSocket>>;
	public subscriptions: WeakMap<WebSocket, Set<string>>;

	constructor() {
		this.channels = new Map();
		this.subscriptions = new WeakMap();
	}

	// Initialize a client's subscription tracking
	initializeClient(ws: WebSocket) {
		// this.subscriptions.set(ws, new Set());
		// this.sendToClient(ws, {
		//   type: "welcome",
		//   channels: Array.from(this.channels.keys()),
		// });
	}
}
