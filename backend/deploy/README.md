# Deploying the backend on a VPS

The keeper and the indexer run as two containers of one image (`backend/keeper/Dockerfile`) next to a shared Caddy that terminates HTTPS. The web app runs on Vercel and reads the indexer's API. Live: web https://solidon.xyz and https://app.solidon.xyz (Vercel team `tame22`, project `solidon`), API https://api.solidon.xyz on the VPS.

```
/opt/solidon/repo         this repo (backend/keeper, backend/deploy, contracts/stocks), shipped with git archive
/opt/solidon/state        indexer data/ and keeper state.json (bridge transfers: move it, never copy it to a second keeper)
/opt/solidon/secrets      solana-keeper.json (chmod 600)
/opt/solidon/secrets.env  ALCHEMY_API_KEY, PYTH_API_KEY, KEEPER_EVM_PRIVATE_KEY, KEEPER_NEAR_PRIVATE_KEY (chmod 600)
```

```bash
# from a checkout, ship the code and (re)build
git archive --format=tar HEAD backend/keeper backend/deploy contracts/stocks | ssh root@<vps> 'rm -rf /opt/solidon/repo && mkdir -p /opt/solidon/repo && tar -x -C /opt/solidon/repo'
ssh root@<vps> 'cd /opt/solidon/repo/backend/deploy && docker compose up -d --build'
```

Only one keeper may run at a time: stop any other keeper before `up`, and move its `state.json` into `/opt/solidon/state`, so a bridge transfer is never paid twice.

Caddy (shared, network `deploy_default`) routes the API:

```
api.solidon.xyz {
	encode gzip
	reverse_proxy solidon-api:8788
}
```

Validate and reload: `docker exec deploy-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`.

The web app on Vercel (project root `frontend/`, framework Next.js) needs `NEXT_PUBLIC_INDEXER_URL=https://api.<domain>` and the server-only `FAUCET_ACCOUNT_ID` / `FAUCET_PRIVATE_KEY`; with a custom domain also `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` (see frontend/README.md).
