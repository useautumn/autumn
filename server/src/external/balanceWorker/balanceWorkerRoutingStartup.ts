let routingSettled = false;

export function markBalanceWorkerRoutingSettled(): void {
	routingSettled = true;
}

export function hasBalanceWorkerRoutingSettled(): boolean {
	return routingSettled;
}
