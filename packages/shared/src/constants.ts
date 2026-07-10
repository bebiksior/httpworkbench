export const GUEST_OWNER_ID = "guest";
export const GUEST_INSTANCE_TTL_MS = 12 * 60 * 60 * 1000;
export const INSTANCE_RAW_LIMIT_BYTES = 10 * 1024 * 1024;
export const GUEST_INSTANCE_RAW_LIMIT_BYTES = 1024 * 1024;
export const GUEST_MAX_ACTIVE_INSTANCES = 1_000;
export const GUEST_CREATE_REQUESTS_PER_MINUTE = 10;
export const INSTANCE_ID_PATTERN = /^[0-9a-z]{8}$/;
export const GUEST_MANAGEMENT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
