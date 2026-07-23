-- Compare-and-delete: remove the claim only if the generation token still
-- matches (a redelivered worker may have re-claimed and merged new state).
-- KEYS[1] claim hash · ARGV[1] generation token
if redis.call('HGET', KEYS[1], '__gen') == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
