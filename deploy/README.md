# Deploying reveal

Runs on `oci-shinigami` as a read-only, non-root nginx container (`compose.yaml`), bound to
`127.0.0.1:8090`. The security headers are generated from `site/security-headers.json`, the same
file the local preview server and the Playwright tests use.

```bash
scripts/deploy.sh            # build, precompress, rsync to ~/stacks/reveal, compose up
```

Tailnet preview: `sudo tailscale serve --bg --https=8444 http://127.0.0.1:8090`
→ https://oci-shinigami.tail338aee.ts.net:8444

Public: https://reveal.shinigami-rog.cc through the Cloudflare Tunnel `reveal`, run by the
`cloudflared` service in `compose.yaml`. Its `config.yml` and tunnel credential live in
`~/stacks/reveal/cloudflared/` on the host (owned by uid 65532, never committed). nginx sends
`Cache-Control: no-transform` so Cloudflare cannot inject scripts, and keeps no access log.
