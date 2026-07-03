/**
 * Follow-up texts queued on one run. The engine pump is the only consumer:
 * it drains at turn boundaries it observed, so delivery can't desync from
 * session behavior. All methods are synchronous — push vs drain/close
 * ordering is settled by the event loop.
 */
export class FollowUpQueue {
	/** Installed by the pump to interrupt a turn in flight on push. */
	onPush?: () => void;
	private items: string[] = [];
	private closedFlag = false;

	get closed() {
		return this.closedFlag;
	}

	get size() {
		return this.items.length;
	}

	close() {
		this.closedFlag = true;
	}

	drain() {
		return this.items.splice(0);
	}

	push(text: string) {
		if (this.closedFlag) throw new Error("Run is closing");
		this.items.push(text);
		this.onPush?.();
	}
}
