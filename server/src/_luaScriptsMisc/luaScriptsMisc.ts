import deleteOwnedLockScript from "./lock/deleteOwnedLock.lua";
import refreshOwnedLockScript from "./lock/refreshOwnedLock.lua";
import acquireQueuePermitsScript from "./queueCapacityLease/acquireQueuePermits.lua";
import releaseQueuePermitScript from "./queueCapacityLease/releaseQueuePermit.lua";

export const DELETE_OWNED_LOCK_SCRIPT = deleteOwnedLockScript;

export const REFRESH_OWNED_LOCK_SCRIPT = refreshOwnedLockScript;

export const ACQUIRE_QUEUE_PERMITS_SCRIPT = acquireQueuePermitsScript;

export const RELEASE_QUEUE_PERMIT_SCRIPT = releaseQueuePermitScript;
