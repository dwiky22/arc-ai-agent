"use client";
import { useState } from "react";
import { ethers } from "ethers";

// ─── SimpleAMM fallback ───────────────────────────────────────
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const AMM_ADDRESS  = "0x717f5bC7C849e502c6C0c4D2f911B0f65Ba25C80";
const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
const AMM_ABI = [
  "function swapAtoB(uint256 amountIn, uint256 minAmountOut) external",
  "function swapBtoA(uint256 amountIn, uint256 minAmountOut) external",
  "function getReserves() view returns (uint256 reserveA, uint256 reserveB)",
];

interface Props {
  wallet: string;
  usdcBal: string;
  eurcBal: string;
  onSuccess: (txHash: string) => void;
}

export default function CircleSwap({ wallet, usdcBal, eurcBal, onSuccess }: Props) {
  const [swapFrom, setSwapFrom] = useState<"USDC" | "EURC">("USDC");
  const [swapTo, setSwapTo]     = useState<"USDC" | "EURC">("EURC");
  const [amount, setAmount]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState("");
  const [reserves, setReserves] = useState<{ a: string; b: string } | null>(null);

  function flip() { setSwapFrom(swapTo); setSwapTo(swapFrom); }

  async function fetchReserves() {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, provider);
      const [rA, rB] = await amm.getReserves();
      setReserves({
        a: parseFloat(ethers.formatUnits(rA, 6)).toFixed(2),
        b: parseFloat(ethers.formatUnits(rB, 6)).toFixed(2),
      });
    } catch {}
  }

  // Estimate output berdasarkan x*y=k
  function estimateOutput(): string {
    if (!amount || !reserves) return "0.00";
    const amtIn = parseFloat(amount);
    const rIn  = swapFrom === "USDC" ? parseFloat(reserves.a) : parseFloat(reserves.b);
    const rOut = swapFrom === "USDC" ? parseFloat(reserves.b) : parseFloat(reserves.a);
    if (rIn === 0 || rOut === 0) return "0.00";
    const amtInAfterFee = amtIn * 0.997; // 0.3% fee
    const amtOut = (rOut * amtInAfterFee) / (rIn + amtInAfterFee);
    return amtOut.toFixed(4);
  }

  async function handleSwap() {
    if (!amount || !wallet) return;
    setLoading(true);
    setStatus("");

    // Try Circle SwapKit first
    try {
      setStatus("⏳ Trying Circle Swap Kit (official pool)...");
      const { SwapKit } = await import("@circle-fin/swap-kit");
      const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const provider = (window as any).ethereum;
      const adapter = await createAdapterFromProvider({ provider });
      const kit = new SwapKit();
      const result = await kit.swap({
        from: { adapter, chain: "Arc_Testnet" },
        tokenIn: swapFrom as "USDC" | "EURC",
        tokenOut: swapTo as "USDC" | "EURC",
        amountIn: amount,
        config: { kitKey: process.env.NEXT_PUBLIC_KIT_KEY as string },
      });
      const txHash = (result as any).txHash;
      setStatus("✅ Swap via Circle Swap Kit berhasil!");
      onSuccess(txHash);
      setLoading(false);
      return;
    } catch (circleErr: any) {
      console.warn("Circle SwapKit failed:", circleErr?.message || circleErr);
    }

    // Fallback: SimpleAMM
    setStatus("⏳ Fallback ke SimpleAMM...");
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const parsed = ethers.parseUnits(amount, 6);

      // Cek reserves dulu
      const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, signer);
      const [rA, rB] = await amm.getReserves();
      const rIn  = swapFrom === "USDC" ? rA : rB;
      const rOut = swapFrom === "USDC" ? rB : rA;

      if (rOut === 0n) {
        setStatus("❌ Pool AMM kosong — tidak ada likuiditas. Coba tambah likuiditas dulu atau gunakan Circle Swap Kit.");
        setLoading(false);
        return;
      }

      if (swapFrom === "USDC") {
        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        await (await usdc.approve(AMM_ADDRESS, parsed)).wait();
        const tx = await amm.swapAtoB(parsed, 0n);
        await tx.wait();
        setStatus("✅ Swap via SimpleAMM berhasil!");
        onSuccess(tx.hash);
      } else {
        const eurc = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);
        await (await eurc.approve(AMM_ADDRESS, parsed)).wait();
        const tx = await amm.swapBtoA(parsed, 0n);
        await tx.wait();
        setStatus("✅ Swap via SimpleAMM berhasil!");
        onSuccess(tx.hash);
      }
    } catch (ammErr: any) {
      setStatus("❌ " + (ammErr.message || "Swap failed").slice(0, 100));
    }
    setLoading(false);
  }

  // Fetch reserves saat mount
  useState(() => { fetchReserves(); });

  const estimated = estimateOutput();

  return (
    <div className="p-6 space-y-3">
      {/* Pay */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">You Pay</span>
          <button onClick={() => setAmount(swapFrom === "USDC" ? usdcBal : eurcBal)}
            className="text-[10px] text-violet-400 hover:text-violet-300 font-mono">
            MAX: {swapFrom === "USDC" ? usdcBal : eurcBal}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number"
            className="flex-1 bg-transparent text-white text-3xl outline-none font-mono placeholder:text-gray-800 min-w-0"/>
          <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 flex-shrink-0">
            <span>{swapFrom === "USDC" ? "🔵" : "🟡"}</span>
            <span className="font-mono text-white text-sm font-bold">{swapFrom}</span>
          </div>
        </div>
      </div>

      {/* Flip */}
      <div className="flex justify-center py-1">
        <button onClick={flip}
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-violet-500/30 text-gray-500 hover:text-violet-400 flex items-center justify-center transition-all hover:scale-110 active:scale-95">
          ⇅
        </button>
      </div>

      {/* Receive */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
        <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest block mb-3">You Receive (est.)</span>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-3xl font-mono text-gray-400">{estimated}</span>
          <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 flex-shrink-0">
            <span>{swapTo === "USDC" ? "🔵" : "🟡"}</span>
            <span className="font-mono text-white text-sm font-bold">{swapTo}</span>
          </div>
        </div>
      </div>

      {/* Pool info */}
      {reserves && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 flex justify-between">
          <span className="text-[10px] text-gray-500 font-mono">Pool: {reserves.a} USDC / {reserves.b} EURC</span>
          <button onClick={fetchReserves} className="text-[10px] text-gray-600 hover:text-gray-400 font-mono">⟳</button>
        </div>
      )}

      {/* Info */}
      <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl px-4 py-3">
        <p className="text-[10px] text-gray-500 font-mono">ⓘ Circle SwapKit (pool resmi) → SimpleAMM fallback</p>
        <p className="text-[10px] text-gray-600 font-mono mt-0.5">Fee: 0.3% · Slippage: auto</p>
      </div>

      <button onClick={handleSwap} disabled={!wallet || !amount || loading || swapFrom === swapTo}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30">
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Processing...</>
          : <>⇄ Swap {swapFrom} → {swapTo}</>}
      </button>

      {status && (
        <div className={`rounded-xl px-4 py-3 text-xs font-mono border ${
          status.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300" :
          status.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300" :
          "bg-amber-500/8 border-amber-500/20 text-amber-300"
        }`}>{status}</div>
      )}
    </div>
  );
}
