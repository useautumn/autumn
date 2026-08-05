local now = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local concurrencyLimit = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)

local active = redis.call("ZCARD", KEYS[1])
local available = math.max(0, concurrencyLimit - active)
local acquired = math.min(requested, available)

for index = 1, acquired do
	redis.call("ZADD", KEYS[1], expiresAt, ARGV[4 + index])
end

if acquired > 0 then
	redis.call("PEXPIRE", KEYS[1], math.max(1, expiresAt - now) * 2)
end

return acquired
