// app/api/swap/route.ts
// Server-side proxy — Circle API dipanggil dari server, bukan browser
import { NextRequest, NextResponse } from "next/server";
import { AppKit } from "@circle-fin/app-kit";
import { createEthersAdapterFromPrivateKey } from "@circle-fin/adapter-ethers-v6";

const KIT_KEY     = process.env.CIRCLE_KIT_KEY || process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY || "";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { tokenIn, tokenOut, amountIn, wallet } = await req.json();

    if (!KIT_KEY)     return NextResponse.json({ error: "KIT_KEY tidak di-set" }, { status: 500 });
    if (!PRIVATE_KEY) return NextResponse.json({ error: "DEPLOYER_PRIVATE_KEY tidak di-set" }, { status: 500 });
    if (!tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json({ error: "tokenIn, tokenOut, amountIn wajib diisi" }, { status: 400 });
    }

    // Adapter pakai private key server — hanya untuk eksekusi swap onchain
    // Wallet user dipakai sebagai toAddress di result (informational)
    const adapter = createEthersAdapterFromPrivateKey({
      privateKey: PRIVATE_KEY,
    });

    const kit = new AppKit();

    const result = await kit.swap({
      from: { adapter, chain: "Arc_Testnet" },
      tokenIn:  tokenIn  as "USDC" | "EURC",
      tokenOut: tokenOut as "EURC" | "USDC",
      amountIn,
      config: { kitKey: KIT_KEY },
    });

    return NextResponse.json({
      txHash:    result.txHash,
      amountOut: result.amountOut,
      explorerUrl: result.explorerUrl,
    });

  } catch (e: any) {
    const msg = e?.reason || e?.message || "Swap failed";
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
