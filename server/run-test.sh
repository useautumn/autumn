#!/bin/bash
set -e  # Exit on first failure

echo "✅ Starting Autumn test suite..."

for i in {1..5}; do
  echo "👉 Running shell/g$i.sh"
  chmod +x shell/g$i.sh
  ./shell/g$i.sh
done

echo "🎉 All tests passed!"
