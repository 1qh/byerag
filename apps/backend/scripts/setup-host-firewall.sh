#!/usr/bin/env bash
# Apply host nft ruleset per byerag-docs/docs/adr/network-bridge-rules.md.
# Runs inside Colima Linux VM (operator's Mac dev) or directly on prod Linux host.
# Output policy drop + kimi_ips allowlist + DNS + RFC1918/docker bridges.
set -euo pipefail
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null; then
  exec sudo -E "$0" "$@"
fi
KIMI_IPS=${KIMI_IPS:-}
if [ -z "$KIMI_IPS" ]; then
  if command -v dig >/dev/null; then
    KIMI_IPS=$(dig +short A api.kimi.com | grep -E '^[0-9.]+$' | paste -sd, -)
  fi
fi
if [ -z "$KIMI_IPS" ]; then
  echo "[fw] FATAL: KIMI_IPS unset and dig unavailable" >&2
  exit 2
fi
nft -f - <<EOF
table inet byerag-fw {
  set kimi_ips {
    type ipv4_addr
    elements = { ${KIMI_IPS} }
  }
  chain output {
    type filter hook output priority 0; policy drop;
    ct state established,related accept
    oifname "lo" accept
    udp dport 53 accept
    ip daddr 10.0.0.0/8 accept
    ip daddr 172.16.0.0/12 accept
    ip daddr 192.168.0.0/16 accept
    ip daddr 127.0.0.0/8 accept
    tcp dport 443 ip daddr @kimi_ips accept
  }
}
EOF
echo "[fw] ok kimi_ips=$KIMI_IPS"
