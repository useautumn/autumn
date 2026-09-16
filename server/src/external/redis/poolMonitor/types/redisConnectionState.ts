export type RedisConnectionState = {
	preferred?: boolean;
	usable?: boolean;
	readLane?: number;
	readLaneInFlight?: number;
};
