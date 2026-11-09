// Shared devnet setup: RPC URL from backend/.env (never printed), throwaway payer in .secrets/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.SOLIDON_ENV || path.join(HERE, "../.env");
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const key = env.match(/^ALCHEMY_API_KEY=(.*)$/m)?.[1]?.trim();
export const RPC = key ? `https://solana-devnet.g.alchemy.com/v2/${key}` : "https://api.devnet.solana.com";
// Alchemy devnet has no signatureSubscribe, so confirmations subscribe through the public devnet websocket.
export const conn = new Connection(RPC, { commitment: "confirmed", wsEndpoint: "wss://api.devnet.solana.com" });

export const CLMM = new PublicKey("devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH");
export const STATE = path.join(HERE, "state.json");
export const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});
export const writeState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");

// Throwaway devnet keypairs, created on first use under .secrets/ (git-ignored).
export function keypair(name) {
  const file = path.join(HERE, `.secrets/${name}.json`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600 });
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}
export const payer = () => keypair("payer");

// The SDK ships a minified bundle; print errors without dumping it.
process.on("uncaughtException", (e) => {
  console.error("ERROR:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});

export const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
