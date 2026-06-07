"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";

// ─── SimpleAMM on ARC Testnet ────────────────────────────────
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const AMM_ADDRESS  = "0x717f5bC7C849e502c6C0c4D2f911B0f65Ba25C80";
const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_RPC = "https://rpc.arc.io"; // fallback RPC

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
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
  const [wrongNetwork, setWrongNetwork] = useState(false);

  function flip() {
    setSwapFrom(swapTo);
    setSwapTo(swapFrom);
  }

  // Fetch reserves pakai public RPC supaya tidak butuh switch chain dulu
  async function fetchReserves() {
    try {
      // Coba pakai BrowserProvider dulu (kalau sudah di ARC)
      let provider: ethers.Provider;
      try {
        const eth = (window as any).ethereum;
        const network = await new ethers.BrowserProvider(eth).getNetwork();
        if (network.chainId === BigInt(0x4cef52)) {
          provider = new ethers.BrowserProvider(eth);
          setWrongNetwork(false);
        } else {
          provider = new ethers.JsonRpcProvider(ARC_RPC);
          setWrongNetwork(true);
        }
      } catch {
        provider = new ethers.JsonRpcProvider(ARC_RPC);
      }
      const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, provider);
      const [rA, rB] = await amm.getReserves();
      setReserves({
        a: parseFloat(ethers.formatUnits(rA, 6)).toFixed(2),
        b: parseFloat(ethers.formatUnits(rB, 6)).toFixed(2),
      });
    } catch (e) {
      console.warn("fetchReserves error:", e);
    }
  }

  // useEffect bukan useState
  useEffect(() => {
    fetchReserves();
  }, []);

  // Estimate output dengan x*y=k
  function estimateOutput(): string {
    if (!amount || !reserves) return "0.00";
    const amtIn = parseFloat(amount);
    if (isNaN(amtIn) || amtIn <= 0) return "0.00";
    const rIn  = swapFrom === "USDC" ? parseFloat(reserves.a) : parseFloat(reserves.b);
    const rOut = swapFrom === "USDC" ? parseFloat(reserves.b) : parseFloat(reserves.a);
    if (rIn <= 0 || rOut <= 0) return "0.00";
    const amtInAfterFee = amtIn * 0.997;
    const amtOut = (rOut * amtInAfterFee) / (rIn + amtInAfterFee);
    return Math.max(0, amtOut).toFixed(4);
  }

  async function ensureArcNetwork() {
    const eth = (window as any).ethereum;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ARC_CHAIN_ID_HEX,
            chainName: "ARC Testnet",
            rpcUrls: [ARC_RPC],
            nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
            blockExplorerUrls: ["https://testnet.arcscan.app"],
          }],
        });
      } else throw e;
    }
  }

  async function handleSwap() {
    if (!amount || !wallet) return;
    setLoading(true);
    setStatus("");

    try {
      const eth = (window as any).ethereum;

      // Pastikan di ARC network
      setStatus("⏳ Switching ke ARC Testnet...");
      await ensureArcNetwork();

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const parsed = ethers.parseUnits(amount, 6);

      // Cek reserves
      const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, signer);
      const [rA, rB] = await amm.getReserves();
      setReserves({
        a: parseFloat(ethers.formatUnits(rA, 6)).toFixed(2),
        b: parseFloat(ethers.formatUnits(rB, 6)).toFixed(2),
      });

      const rIn  = swapFrom === "USDC" ? rA : rB;
      const rOut = swapFrom === "USDC" ? rB : rA;

      if (rOut === 0n) {
        setStatus("❌ Pool kosong — tidak ada likuiditas untuk swap.");
        setLoading(false);
        return;
      }

      // Hitung minAmountOut dengan 1% slippage tolerance
      const rInFloat  = parseFloat(ethers.formatUnits(rIn, 6));
      const rOutFloat = parseFloat(ethers.formatUnits(rOut, 6));
      const amtFloat  = parseFloat(amount);
      const amtInFee  = amtFloat * 0.997;
      const estOut    = (rOutFloat * amtInFee) / (rInFloat + amtInFee);
      const minOut    = ethers.parseUnits((estOut * 0.99).toFixed(6), 6); // 1% slippage

      // Token address yang akan di-approve
      const tokenAddress = swapFrom === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      // Cek allowance dulu
      setStatus("⏳ Checking allowance...");
      const allowance = await token.allowance(wallet, AMM_ADDRESS);
      if (allowance < parsed) {
        setStatus(`⏳ Approving ${swapFrom}... (confirm di wallet)`);
        const approveTx = await token.approve(AMM_ADDRESS, parsed);
        await approveTx.wait();
      }

      // Execute swap
      setStatus(`⏳ Swapping ${amount} ${swapFrom} → ${swapTo}... (confirm di wallet)`);
      let tx;
      if (swapFrom === "USDC") {
        tx = await amm.swapAtoB(parsed, minOut);
      } else {
        tx = await amm.swapBtoA(parsed, minOut);
      }
      await tx.wait();

      setStatus(`✅ Swap berhasil! ${amount} ${swapFrom} → ~${estOut.toFixed(4)} ${swapTo}`);
      onSuccess(tx.hash);
      setAmount("");

      // Refresh reserves setelah swap
      await fetchReserves();

    } catch (e: any) {
      console.error("Swap error:", e);
      // Parse error message lebih baik
      const msg = e?.reason || e?.data?.message || e?.shortMessage || e?.message || "Swap failed";
      if (msg.includes("insufficient")) {
        setStatus("❌ Saldo tidak cukup untuk swap.");
      } else if (msg.includes("INSUFFICIENT_OUTPUT")) {
        setStatus("❌ Slippage terlalu tinggi. Coba jumlah yang lebih kecil.");
      } else if (msg.includes("user rejected")) {
        setStatus("❌ Transaksi dibatalkan di wallet.");
      } else {
        setStatus("❌ " + msg.slice(0, 150));
      }
    }
    setLoading(false);
  }

  const estimated = estimateOutput();
  const maxBalance = swapFrom === "USDC" ? usdcBal : eurcBal;

  return (
    <div className="p-6 space-y-3">
      {/* Wrong network warning */}
      {wrongNetwork && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-[11px] text-amber-400 font-mono">⚠ Switch ke ARC Testnet untuk swap</p>
          <button onClick={ensureArcNetwork}
            className="text-[10px] text-amber-300 hover:text-amber-200 font-mono bg-amber-500/10 px-2 py-1 rounded-lg">
            Switch
          </button>
        </div>
      )}

      {/* Pay */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">You Pay</span>
          <button onClick={() => setAmount(maxBalance)}
            className="text-[10px] text-violet-400 hover:text-violet-300 font-mono">
            MAX: {maxBalance}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" type="number"
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
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-[10px] text-gray-500 font-mono">
            Pool: {reserves.a} USDC / {reserves.b} EURC
          </span>
          <button onClick={fetchReserves} className="text-[10px] text-gray-600 hover:text-gray-400 font-mono">⟳ Refresh</button>
        </div>
      )}

      {/* Info */}
      <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl px-4 py-3">
        <p className="text-[10px] text-gray-500 font-mono">ⓘ SimpleAMM · x·y=k formula</p>
        <p className="text-[10px] text-gray-600 font-mono mt-0.5">Fee: 0.3% · Slippage tolerance: 1%</p>
      </div>

      <button onClick={handleSwap}
        disabled={!wallet || !amount || loading || swapFrom === swapTo}
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
