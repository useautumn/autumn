local value = redis.call("GET", KEYS[1])
if not value then return 0 end
if value == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) end
local ok, lock = pcall(cjson.decode, value)
if not ok or type(lock) ~= "table" or lock.token ~= ARGV[1] then return 0 end
return redis.call("PEXPIRE", KEYS[1], ARGV[2])
