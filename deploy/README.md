# Deploying reveal

Runs on `oci-shinigami` as a read-only, non-root nginx container (`compose.yaml`), bound to
`127.0.0.1:8090`. The security headers are generated from `site/security-headers.json`, the same
file the local preview server and the Playwright tests use.

```bash
scripts/deploy.sh            # build, precompress, rsync to ~/stacks/reveal, compose up
```

Tailnet preview: `sudo tailscale serve --bg --https=8444 http://127.0.0.1:8090`
→ https://oci-shinigami.tail338aee.ts.net:8444

Public launch (reveal.shinigami-rog.cc): add a Cloudflare Tunnel hostname pointing at the
container, the same way the ntfy tunnel works on that host.
