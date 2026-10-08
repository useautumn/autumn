
local function hit(key, windowMs)
	local hits = redis.call("INCR", key)
	local ttl = redis.call("PTTL", key)
	if ttl <= 0 then
		redis.call("PEXPIRE", key, windowMs)
		ttl = windowMs
	end
	return { hits, ttl }
end
local org = hit(KEYS[1], tonumber(ARGV[1]))
if org[1] > tonumber(ARGV[2]) and ARGV[3] ~= "1" then
	return org
end
local customer = hit(KEYS[2], tonumber(ARGV[4]))
return { org[1], org[2], customer[1], customer[2] }
