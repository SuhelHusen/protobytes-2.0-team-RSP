#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3001/api}"

echo "=== HEALTH CHECK ==="
curl -s "$BASE_URL/health" | jq .

echo
echo "=== SIGNUP ==="
SIGNUP=$(curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "test@example.com",
    "password": "password123",
    "stream": "PLUS2_SCIENCE"
  }')
echo "$SIGNUP" | jq .
TOKEN=$(echo "$SIGNUP" | jq -r '.token // empty')

echo
echo "=== LOGIN ==="
curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq .

if [[ -n "$TOKEN" ]]; then
  echo
  echo "=== GET ME ==="
  curl -s "$BASE_URL/auth/me" \
    -H "Authorization: Bearer $TOKEN" | jq .

  echo
  echo "=== TASKS STUB ==="
  curl -s "$BASE_URL/tasks" \
    -H "Authorization: Bearer $TOKEN" | jq .
fi

echo
echo "Done."
