"use client";
import { useState } from "react";
import { ethers } from "ethers";

const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_RPC          = "https://rpc.testnet.arc.network";
const USDC_ADDRESS     = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS     = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const AMM_ADDRESS      = "0x717f5bC7C849e502c6C0c4D2f911B0f65Ba25C80";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const AMM_ABI = [
  "function swapAtoB(uint256 amountIn, uint256 minAmountOut) external",
  "function swapBtoA(uint256 amountIn, uint256 minAmountOut) external",
];

interface Props { wallet: string; onSuccess: (txHash: string) => void; }

export default function CircleSwap({ wallet, onSuccess }: Props) {
  const [direction, setDirection] = useState<"USDC_EURC" | "EURC_USDC">("USDC_EURC");
  const [amount, setAmount]       = useState("");
  const [usdcBal, setUsdcBal]     = useState("");
  const [eurcBal, setEurcBal]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState("");
  const [steps, setSteps]         = useState<string[]>([]);

  const tokenIn  = direction === "USDC_EURC" ? "USDC" : "EURC";
  const tokenOut = direction === "USDC_EURC" ? "EURC" : "USDC";

  // Ambil provider yang benar — prioritas Rabby, fallback MetaMask
  function getProvider() {
    const win = window as any;
    // Rabby inject sebagai window.rabby atau window.ethereum dengan isRabby
    const eth = win.rabby || 
                (win.ethereum?.isRabby ? win.ethereum : null) ||
                win.ethereum;
    if (!eth) throw new Error("Wallet tidak ditemukan. Pastikan Rabby/MetaMask aktif.");
    return eth;
  }

  async function ensureARC() {
    const eth = getProvider();
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e.code === 4902 || e.code === -32603) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: ARC_CHAIN_ID_HEX, chainName: "ARC Testnet", rpcUrls: [ARC_RPC], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 } }],
        });
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }

  async function fetchBalances() {
    if (!wallet) return;
    try {
      const eth = getProvider();
      await ensureARC();
      const provider = new ethers.BrowserProvider(eth);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const eurc = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
      const [u, e] = await Promise.all([usdc.balanceOf(wallet), eurc.balanceOf(wallet)]);
      setUsdcBal(parseFloat(ethers.formatUnits(u, 6)).toFixed(2));
      setEurcBal(parseFloat(ethers.formatUnits(e, 6)).toFixed(2));
    } catch (err) { console.warn("fetchBalances:", err); }
  }

  async function handleSwap() {
    if (!amount || !wallet) return;
    setLoading(true); setStatus(""); setSteps([]);

    try {
      const eth = getProvider();

      setStatus("⏳ Switching ke ARC Testnet...");
      await ensureARC();

      // Request accounts dulu — pastikan wallet sudah unlock
      await eth.request({ method: "eth_requestAccounts" });
      await new Promise(r => setTimeout(r, 500));

      const provider = new ethers.BrowserProvider(eth);
      const signer   = await provider.getSigner();
      const address  = await signer.getAddress();

      const amountParsed = ethers.parseUnits(amount, 6);
      const minOut       = (amountParsed * 95n) / 100n;

      const tokenInAddress = direction === "USDC_EURC" ? USDC_ADDRESS : EURC_ADDRESS;
      const tokenContract  = new ethers.Contract(tokenInAddress, ERC20_ABI, signer);
      const amm            = new ethers.Contract(AMM_ADDRESS, AMM_ABI, signer);

      // Cek allowance dulu
      const allowance = await tokenContract.allowance(address, AMM_ADDRESS);

      if (allowance < amountParsed) {
        setStatus("⏳ Step 1/2: Approve token... (cek wallet kamu!)");
        setSteps(["approve: menunggu konfirmasi di wallet..."]);
        const approveTx = await tokenContract.approve(AMM_ADDRESS, amountParsed);
        setSteps(["approve: waiting block confirmation..."]);
        await approveTx.wait();
        setSteps(["approve: ✓ selesai"]);
      } else {
        setSteps(["approve: ✓ sudah ada allowance"]);
      }

      setStatus("⏳ Step 2/2: Swap... (cek wallet kamu!)");
      const swapTx = direction === "USDC_EURC"
        ? await amm.swapAtoB(amountParsed, minOut)
        : await amm.swapBtoA(amountParsed, minOut);

      setSteps(prev => [...prev, "swap: menunggu konfirmasi..."]);
      const receipt = await swapTx.wait();
      const txHash  = receipt.hash;

      await fetchBalances();
      setSteps(prev => [...prev.slice(0,-1), `swap: ✓ txHash: ${txHash.slice(0,14)}...`]);
      setStatus(`✅ Swap berhasil! ${amount} ${tokenIn} → ${tokenOut}`);
      setAmount("");
      onSuccess(txHash);

    } catch (e: any) {
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setStatus("❌ Dibatalkan oleh user.");
      } else {
        const msg = e?.reason || e?.message || "Swap failed";
        setStatus("❌ " + String(msg).slice(0, 300));
      }
    }
    setLoading(false);
  }

  const inBal  = direction === "USDC_EURC" ? usdcBal : eurcBal;
  const outBal = direction === "USDC_EURC" ? eurcBal : usdcBal;

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">You Pay</span>
          <div className="flex items-center gap-2">
            {inBal && <span className="text-[10px] text-gray-500 font-mono">bal: {inBal}</span>}
            {inBal && <button onClick={() => setAmount(inBal)} className="text-[10px] text-blue-400 font-mono hover:text-blue-300">MAX</button>}
            <button onClick={fetchBalances} className="text-[10px] text-gray-600 hover:text-gray-400 font-mono transition-colors">↻ refresh</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${tokenIn === "USDC" ? "bg-blue-500/10 border-blue-500/20 text-blue-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{tokenIn}</div>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number"
            className="flex-1 bg-transparent text-white text-lg font-mono outline-none placeholder:text-gray-700"/>
        </div>
      </div>

      <div className="flex justify-center">
        <button onClick={() => setDirection(d => d === "USDC_EURC" ? "EURC_USDC" : "USDC_EURC")}
          className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-all text-sm">
          ⇅
        </button>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">You Receive</span>
          {outBal && <span className="text-[10px] text-gray-500 font-mono">bal: {outBal}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${tokenOut === "USDC" ? "bg-blue-500/10 border-blue-500/20 text-blue-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{tokenOut}</div>
          <span className="flex-1 text-gray-600 text-lg font-mono">~</span>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-[10px] text-gray-500 font-mono">⬡ Swap on ARC Testnet · SimpleAMM onchain</p>
        <p className="text-[10px] text-gray-500 font-mono">💱 USDC ↔ EURC · Signed dari wallet kamu</p>
      </div>

      <button onClick={handleSwap} disabled={!wallet || !amount || loading}
        className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2">
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Swapping...</>
          : <>⇄ Swap {amount || "0"} {tokenIn} → {tokenOut}</>
        }
      </button>

      {steps.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1">
          {steps.map((s, i) => <p key={i} className="text-[10px] font-mono text-gray-400">✓ {s}</p>)}
        </div>
      )}

      {status && (
        <div className={`rounded-xl px-4 py-3 text-xs font-mono border whitespace-pre-wrap ${
          status.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300"
          : status.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300"
          : "bg-amber-500/8 border-amber-500/20 text-amber-300"
        }`}>{status}</div>
      )}
    </div>
  );
}
