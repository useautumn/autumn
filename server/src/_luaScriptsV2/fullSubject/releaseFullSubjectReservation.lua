--[[
  Release a FullSubject write reservation if the token matches.

  KEYS:
    [1] reserveKey

  ARGV:
    [1] token

  Returns:
    "RELEASED" = reservation matched and was deleted
    "SKIPPED" = key missing or token mismatch
]]

local reserveKey = KEYS[1]
local token = ARGV[1]

local existingToken = redis.call("GET", reserveKey)
if existingToken ~= token then
  return "SKIPPED"
end

redis.call("DEL", reserveKey)
return "RELEASED"
