"use client";
import { useState } from "react";
import { ethers } from "ethers";

const BRIDGE_CHAIN_CONFIG: Record<string, {
  chainIdHex: string; name: string; rpc: string; symbol: string;
  usdcAddress: string; domain: number;
}> = {
  Ethereum_Sepolia: {
    chainIdHex: "0xaa36a7", name: "Ethereum Sepolia",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    symbol: "ETH", usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    domain: 0,
  },
  Base_Sepolia: {
    chainIdHex: "0x14a34", name: "Base Sepolia",
    rpc: "https://base-sepolia-rpc.publicnode.com",
    symbol: "ETH", usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    domain: 6,
  },
  Arbitrum_Sepolia: {
    chainIdHex: "0x66eee", name: "Arbitrum Sepolia",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    symbol: "ETH", usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    domain: 3,
  },
  Avalanche_Fuji: {
    chainIdHex: "0xa869", name: "Avalanche Fuji",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    symbol: "AVAX", usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    domain: 1,
  },
  OP_Sepolia: {
    chainIdHex: "0xaa37dc", name: "Optimism Sepolia",
    rpc: "https://sepolia.optimism.io",
    symbol: "ETH", usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D9",
    domain: 2,
  },
};

const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_RPC = "https://rpc.arc.io";

// CCTP v2 addresses (testnet)
const TOKEN_MESSENGER_V2    = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const ARC_MSG_TRANSMITTER   = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const IRIS_API              = "https://iris-api-sandbox.circle.com/v2/messages";
const ARC_CCTP_DOMAIN       = 26;

const USDC_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const MESSENGER_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)",
];
const TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
];

const BRIDGE_CHAINS = [
  { value: "Ethereum_Sepolia", label: "Ethereum Sepolia", icon: "Ξ" },
  { value: "Base_Sepolia",     label: "Base Sepolia",     icon: "B" },
  { value: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", icon: "A" },
  { value: "Avalanche_Fuji",   label: "Avalanche Fuji",   icon: "▲" },
  { value: "OP_Sepolia",       label: "Optimism Sepolia", icon: "O" },
];

interface Props {
  wallet: string;
  onSuccess: (txHash: string) => void;
}

export default function CircleBridge({ wallet, onSuccess }: Props) {
  const [fromChain, setFromChain]   = useState("Base_Sepolia");
  const [amount, setAmount]         = useState("");
  const [srcBalance, setSrcBalance] = useState("");
  const [loading, setLoading]       = useState(false);
  const [switching, setSwitching]   = useState(false);
  const [status, setStatus]         = useState("");
  const [steps, setSteps]           = useState<string[]>([]);

  // ─── Helper: switch wallet ke chain tertentu ───────────────
  async function switchToChain(chainIdHex: string, name: string, rpc: string, symbol: string) {
    const eth = (window as any).ethereum;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (e: any) {
      if (e.code === 4902 || e.code === -32603) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: chainIdHex, chainName: name, rpcUrls: [rpc], nativeCurrency: { name: symbol, symbol, decimals: 18 } }],
        });
        // Coba switch lagi setelah add
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      } else {
        throw e;
      }
    }
    // Tunggu chain benar-benar berganti sebelum lanjut
    await new Promise(r => setTimeout(r, 600));
  }

  // ─── Switch + fetch balance saat user pilih chain ─────────
  async function switchAndFetch(chain: string) {
    if (!wallet) return;
    setSwitching(true);
    setSrcBalance("");
    try {
      const cfg = BRIDGE_CHAIN_CONFIG[chain];
      await switchToChain(cfg.chainIdHex, cfg.name, cfg.rpc, cfg.symbol);

      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const usdc = new ethers.Contract(cfg.usdcAddress, USDC_ABI, provider);
      const bal = await usdc.balanceOf(wallet);
      setSrcBalance(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e: any) {
      console.warn("switchAndFetch error:", e.message);
    }
    setSwitching(false);
  }

  // ─── Main bridge handler ───────────────────────────────────
  async function handleBridge() {
    if (!amount || !wallet) return;
    setLoading(true);
    setStatus("");
    setSteps([]);
    await bridgeCCTP();
    setLoading(false);
  }

  // ─── CCTP v2 Bridge: Burn → Poll Iris → Mint ──────────────
  async function bridgeCCTP() {
    try {
      const cfg = BRIDGE_CHAIN_CONFIG[fromChain];
      const eth = (window as any).ethereum;
      const parsed = ethers.parseUnits(amount, 6);

      // ── Step 1: Pastikan di source chain, lalu cek saldo ──
      setStatus("⏳ Switching ke " + cfg.name + "...");
      await switchToChain(cfg.chainIdHex, cfg.name, cfg.rpc, cfg.symbol);

      const provider = new ethers.BrowserProvider(eth);
      const signer   = await provider.getSigner();
      const usdc     = new ethers.Contract(cfg.usdcAddress, USDC_ABI, signer);

      const bal = await usdc.balanceOf(wallet);
      if (bal < parsed) {
        setStatus(`❌ Saldo tidak cukup. Saldo kamu: ${ethers.formatUnits(bal, 6)} USDC`);
        return;
      }

      // ── Step 2: Approve (selalu approve max supaya tidak mismatch) ─
      setStatus("⏳ Checking allowance...");
      const allowance = await usdc.allowance(wallet, TOKEN_MESSENGER_V2);
      if (allowance < parsed) {
        setStatus("⏳ Approving USDC... (confirm di wallet)");
        // Approve max uint256 supaya tidak perlu approve lagi ke depannya
        const MAX = ethers.MaxUint256;
        const approveTx = await usdc.approve(TOKEN_MESSENGER_V2, MAX);
        setStatus("⏳ Menunggu approve confirmed...");
        await approveTx.wait(2); // tunggu 2 konfirmasi
        // Verifikasi allowance benar-benar sudah terupdate
        const newAllowance = await usdc.allowance(wallet, TOKEN_MESSENGER_V2);
        if (newAllowance < parsed) {
          setStatus("❌ Approve gagal — allowance masih kurang. Coba lagi.");
          return;
        }
        setSteps(["approve: ✓"]);
      } else {
        setSteps(["approve: sudah ada ✓"]);
      }

      // ── Step 3: Burn via TokenMessengerV2 ─────────────────
      setStatus("⏳ Burning USDC via CCTP v2... (confirm di wallet)");
      const messenger = new ethers.Contract(TOKEN_MESSENGER_V2, MESSENGER_ABI, signer);
      const burnTx = await messenger.depositForBurn(
        parsed,
        ARC_CCTP_DOMAIN,
        ethers.zeroPadValue(wallet, 32),
        cfg.usdcAddress,
        ethers.ZeroHash, // destinationCaller = any
        0n,              // maxFee
        1000             // minFinalityThreshold (fast)
      );
      await burnTx.wait();
      setSteps(prev => [...prev, `burn: ✓ ${burnTx.hash.slice(0, 14)}...`]);

      // ── Step 4: Poll Circle Iris API ───────────────────────
      setStatus("⏳ Menunggu attestation dari Circle...");
      let attestData: any = null;

      for (let i = 0; i < 72; i++) {
        setStatus(`⏳ Polling attestation... (${i + 1}/72) — jangan tutup tab!`);
        try {
          const res = await fetch(`${IRIS_API}/${cfg.domain}?transactionHash=${burnTx.hash}`);
          if (res.ok) {
            const data = await res.json();
            const msg  = data?.messages?.[0];
            if (msg?.status === "complete" && msg?.attestation && msg?.message) {
              attestData = msg;
              break;
            }
          }
        } catch {
          // Iris API kadang timeout, lanjut polling
        }
        await new Promise(r => setTimeout(r, 5000));
      }

      if (!attestData) {
        setStatus(
          `⚠ Attestation timeout (6 menit).\nBurn tx: ${burnTx.hash}\n\nSiman tx hash ini — kamu bisa claim manual nanti di Circle CCTP bridge.`
        );
        return;
      }

      setSteps(prev => [...prev, "attestation: ✓"]);

      // ── Step 5: Switch ke ARC ──────────────────────────────
      setStatus("⏳ Switching ke ARC Testnet...");
      await switchToChain(ARC_CHAIN_ID_HEX, "ARC Testnet", ARC_RPC, "ARC");

      // ── Step 6: Mint di ARC ────────────────────────────────
      setStatus("⏳ Minting USDC di ARC... (confirm di wallet)");
      const arcProvider    = new ethers.BrowserProvider(eth);
      const arcSigner      = await arcProvider.getSigner();
      const transmitter    = new ethers.Contract(ARC_MSG_TRANSMITTER, TRANSMITTER_ABI, arcSigner);

      const mintTx = await transmitter.receiveMessage(
        attestData.message,
        attestData.attestation
      );
      await mintTx.wait();

      setSteps(prev => [...prev, `mint: ✓ ${mintTx.hash.slice(0, 14)}...`]);
      setStatus(`✅ Bridge selesai! ${amount} USDC sudah masuk ARC Testnet!`);
      setAmount("");
      setSrcBalance("");
      onSuccess(mintTx.hash);

    } catch (e: any) {
      // User reject = code 4001
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setStatus("❌ Dibatalkan oleh user.");
      } else {
        const msg = e?.reason || e?.data?.message || e?.message || "Bridge failed";
        setStatus("❌ " + String(msg).slice(0, 250));
      }
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Source chain */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Source Chain</label>
          {switching && (
            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
              <div className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin"/>
              switching...
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {BRIDGE_CHAINS.map(c => (
            <button key={c.value} onClick={() => { setFromChain(c.value); switchAndFetch(c.value); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                fromChain === c.value
                  ? "bg-blue-500/10 border-blue-500/30 text-white"
                  : "bg-white/[0.02] border-white/[0.05] text-gray-500 hover:border-white/10 hover:text-gray-300"
              }`}>
              <span className="w-6 h-6 rounded-lg bg-black/30 flex items-center justify-center text-[11px] font-bold flex-shrink-0">{c.icon}</span>
              <span className="font-mono text-xs flex-1">{c.label}</span>
              {fromChain === c.value && srcBalance && (
                <span className="text-[10px] text-blue-400 font-mono">{srcBalance} USDC</span>
              )}
              {fromChain === c.value && <span className="text-blue-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/[0.05]"/>
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs">↓</div>
        <div className="flex-1 h-px bg-white/[0.05]"/>
      </div>

      {/* Destination */}
      <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">A</div>
          <div>
            <p className="text-white font-mono text-xs font-bold">ARC Testnet</p>
            <p className="text-[10px] text-gray-600 font-mono">CCTP v2 Domain 26 · Auto-mint</p>
          </div>
        </div>
        <span className="text-[10px] text-cyan-400/70 font-mono bg-cyan-500/8 border border-cyan-500/15 px-2 py-1 rounded-lg">Auto ✓</span>
      </div>

      {/* Amount */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Amount USDC</label>
          {srcBalance && (
            <button onClick={() => setAmount(srcBalance)} className="text-[10px] text-blue-400 hover:text-blue-300 font-mono transition-colors">
              MAX: {srcBalance}
            </button>
          )}
        </div>
        <input value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0.00" type="number"
          className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-blue-500/40 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700"/>
      </div>

      {/* Info */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-[10px] text-gray-500 font-mono">🔐 Circle CCTP v2 · TokenMessengerV2</p>
        <p className="text-[10px] text-gray-500 font-mono">⏱ Poll Iris API tiap 5s · timeout 6 menit</p>
        <p className="text-[10px] text-amber-500/70 font-mono">⚠ Jangan tutup tab selama proses berlangsung</p>
      </div>

      <button onClick={handleBridge} disabled={!wallet || !amount || loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Bridging...</>
          : <>⬡ Bridge {amount || "0"} USDC → ARC</>}
      </button>

      {/* Steps log */}
      {steps.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1">
          {steps.map((s, i) => (
            <p key={i} className="text-[10px] font-mono text-gray-400">✓ {s}</p>
          ))}
        </div>
      )}

      {status && (
        <div className={`rounded-xl px-4 py-3 text-xs font-mono border whitespace-pre-wrap ${
          status.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300" :
          status.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300" :
          "bg-amber-500/8 border-amber-500/20 text-amber-300"
        }`}>{status}</div>
      )}
    </div>
  );
}
