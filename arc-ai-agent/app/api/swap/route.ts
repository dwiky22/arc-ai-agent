import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { tokenIn, tokenOut, amount, walletAddress } = await req.json();

    if (!tokenIn || !tokenOut || !amount || !walletAddress) {
      return NextResponse.json({ success: false, error: "Missing parameters" }, { status: 400 });
    }

    // Circle App Kit swap — gunakan KIT_KEY dari env
    const kitKey = process.env.KIT_KEY;
    if (!kitKey) {
      return NextResponse.json({ success: false, error: "KIT_KEY not configured" }, { status: 500 });
    }

    // Token addresses di ARC Testnet
    const TOKEN_ADDRESSES: Record<string, string> = {
      USDC: "0x3600000000000000000000000000000000000000",
      EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    };

    const tokenInAddress = TOKEN_ADDRESSES[tokenIn];
    const tokenOutAddress = TOKEN_ADDRESSES[tokenOut];

    if (!tokenInAddress || !tokenOutAddress) {
      return NextResponse.json({ success: false, error: `Token ${tokenIn} atau ${tokenOut} tidak didukung` }, { status: 400 });
    }

    // Coba pakai Circle App Kit API
    // Circle App Kit endpoint untuk quote dan swap
    const amountInUnits = Math.floor(parseFloat(amount) * 1_000_000).toString(); // 6 decimals

    // Step 1: Get quote
    const quoteRes = await fetch("https://api.circle.com/v1/w3s/swap/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kitKey}`,
        "X-Kit-Key": kitKey,
      },
      body: JSON.stringify({
        chain: "ARC-TESTNET",
        chainId: "5042002",
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn: amountInUnits,
        slippageTolerance: "100", // 1%
        walletAddress,
      }),
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      console.error("Quote error:", errText);
      // Fallback: return info untuk redirect ke Curve
      return NextResponse.json({
        success: false,
        error: "Circle App Kit swap tidak tersedia untuk Arc Testnet saat ini. Gunakan Curve Finance.",
        fallbackUrl: `https://www.curve.finance/dex/arc/swap/?from=${tokenIn}&to=${tokenOut}&amount=${amount}`,
        useFallback: true,
      }, { status: 200 });
    }

    const quote = await quoteRes.json();

    // Step 2: Execute swap
    const swapRes = await fetch("https://api.circle.com/v1/w3s/swap/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kitKey}`,
        "X-Kit-Key": kitKey,
      },
      body: JSON.stringify({
        quoteId: quote.data?.quoteId,
        walletAddress,
      }),
    });

    if (!swapRes.ok) {
      const errText = await swapRes.text();
      console.error("Swap execute error:", errText);
      return NextResponse.json({
        success: false,
        error: "Swap execution gagal",
        useFallback: true,
        fallbackUrl: `https://www.curve.finance/dex/arc/swap/?from=${tokenIn}&to=${tokenOut}&amount=${amount}`,
      }, { status: 200 });
    }

    const swapData = await swapRes.json();

    return NextResponse.json({
      success: true,
      txHash: swapData.data?.txHash || swapData.data?.transactionHash,
      amountOut: swapData.data?.amountOut,
    });

  } catch (error: any) {
    console.error("Swap route error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Internal server error",
      useFallback: true,
    }, { status: 200 });
  }
}
