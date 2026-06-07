"use client";
import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import { switchToArc } from "@/lib/arc-chain";

// Load CircleSwap and CircleBridge only on client side (no SSR)
const CircleSwap = dynamic(() => import("./components/CircleSwap"), { ssr: false });
const CircleBridge = dynamic(() => import("./components/CircleBridge"), { ssr: false });

// ─── ABIs ─────────────────────────────────────────────────────
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];
const EURC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];
const AMM_ABI = [
  "function swapAtoB(uint256 amountIn, uint256 minAmountOut) external",
  "function swapBtoA(uint256 amountIn, uint256 minAmountOut) external",
  "function getReserves() view returns (uint256, uint256)",
];

// ─── Addresses ────────────────────────────────────────────────
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const AMM_ADDRESS  = "0x717f5bC7C849e502c6C0c4D2f911B0f65Ba25C80";

// ─── Bridge chain config ───────────────────────────────────────
const BRIDGE_CHAIN_CONFIG: Record<string, { chainId: string; chainIdHex: string; name: string; rpc: string; symbol: string }> = {
  Ethereum_Sepolia: { chainId:"11155111", chainIdHex:"0xaa36a7", name:"Ethereum Sepolia", rpc:"https://rpc.sepolia.org", symbol:"ETH" },
  Base_Sepolia:     { chainId:"84532",    chainIdHex:"0x14a34",  name:"Base Sepolia",     rpc:"https://sepolia.base.org", symbol:"ETH" },
  Arbitrum_Sepolia: { chainId:"421614",   chainIdHex:"0x66eee",  name:"Arbitrum Sepolia", rpc:"https://sepolia-rollup.arbitrum.io/rpc", symbol:"ETH" },
  Avalanche_Fuji:   { chainId:"43113",    chainIdHex:"0xa869",   name:"Avalanche Fuji",   rpc:"https://api.avax-test.network/ext/bc/C/rpc", symbol:"AVAX" },
  OP_Sepolia:       { chainId:"11155420", chainIdHex:"0xaa37dc", name:"Optimism Sepolia", rpc:"https://sepolia.optimism.io", symbol:"ETH" },
};

const BRIDGE_USDC_ADDRESS: Record<string, string> = {
  Ethereum_Sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  Base_Sepolia:     "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  Arbitrum_Sepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  Avalanche_Fuji:   "0x5425890298aed601595a70AB815c96711a31Bc65",
  OP_Sepolia:       "0x5fd84259d66Cd46123540766Be93DFE6D43130D9",
};

// ─── Types ────────────────────────────────────────────────────
type MessageCardType = "text"|"swap"|"send"|"bridge"|"success"|"error"|"pending";
type Message = {
  role: "user"|"ai";
  content: string;
  txHash?: string;
  cardType?: MessageCardType;
  cardData?: {
    action?: string; from?: string; to?: string;
    tokenIn?: string; tokenOut?: string; amount?: string;
    reason?: string; fromChain?: string; toChain?: string; token?: string;
  };
};
type Tab = "agent"|"send"|"swap"|"bridge"|"dashboard";

// ─── Wallet providers ─────────────────────────────────────────
const WALLET_PROVIDERS = [
  {
    id:"metamask", name:"MetaMask", subtitle:"Most popular",
    icon:(
      <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
        <path d="M36 4L22.5 14.2l2.5-5.9L36 4z" fill="#E2761B"/>
        <path d="M4 4l13.4 10.3-2.4-6L4 4z" fill="#E4761B"/>
        <path d="M30.8 27.6l-3.6 5.5 7.7 2.1 2.2-7.4-6.3-.2z" fill="#E4761B"/>
        <path d="M2.9 27.8l2.2 7.4 7.7-2.1-3.6-5.5-6.3.2z" fill="#E4761B"/>
        <path d="M12.4 17.8l-2.1 3.2 7.5.3-.3-8.1-5.1 4.6z" fill="#E4761B"/>
        <path d="M27.6 17.8l-5.2-4.7-.2 8.2 7.5-.3-2.1-3.2z" fill="#E4761B"/>
        <path d="M12.8 33.1l4.5-2.2-3.9-3-.6 5.2z" fill="#E4761B"/>
        <path d="M22.7 30.9l4.5 2.2-.6-5.2-3.9 3z" fill="#E4761B"/>
      </svg>
    ),
    accent:"#E4761B",
  },
  {
    id:"rabby", name:"Rabby Wallet", subtitle:"DeFi native",
    icon:(
      <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
        <circle cx="20" cy="20" r="18" fill="#8697FF" opacity="0.15"/>
        <ellipse cx="20" cy="22" rx="12" ry="9" fill="#8697FF"/>
        <circle cx="15" cy="18" r="3" fill="white"/>
        <circle cx="25" cy="18" r="3" fill="white"/>
        <circle cx="15" cy="18" r="1.5" fill="#333"/>
        <circle cx="25" cy="18" r="1.5" fill="#333"/>
        <path d="M14 28 Q20 32 26 28" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
    ),
    accent:"#8697FF",
  },
  {
    id:"coinbase", name:"Coinbase Wallet", subtitle:"Beginner friendly",
    icon:(
      <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
        <circle cx="20" cy="20" r="18" fill="#0052FF"/>
        <circle cx="20" cy="20" r="10" fill="white"/>
        <rect x="15" y="17" width="10" height="6" rx="3" fill="#0052FF"/>
      </svg>
    ),
    accent:"#0052FF",
  },
  {
    id:"trust", name:"Trust Wallet", subtitle:"Mobile friendly",
    icon:(
      <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
        <path d="M20 4 L34 10 L34 22 C34 30 20 36 20 36 C20 36 6 30 6 22 L6 10 Z" fill="#3375BB"/>
        <path d="M14 20 L18 24 L26 16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
    accent:"#3375BB",
  },
  {
    id:"injected", name:"Browser Wallet", subtitle:"Any EVM wallet",
    icon:(
      <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
        <rect x="4" y="8" width="32" height="24" rx="4" fill="#374151"/>
        <rect x="8" y="12" width="24" height="14" rx="2" fill="#1F2937"/>
        <circle cx="20" cy="19" r="4" fill="#10B981"/>
        <rect x="15" y="28" width="10" height="2" rx="1" fill="#4B5563"/>
      </svg>
    ),
    accent:"#10B981",
  },
];

const NAV_ITEMS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id:"agent",     label:"AI Agent",  icon:"◈", desc:"Smart commands" },
  { id:"send",      label:"Send",      icon:"↗", desc:"Transfer tokens" },
  { id:"swap",      label:"Swap",      icon:"⇄", desc:"Exchange tokens" },
  { id:"bridge",    label:"Bridge",    icon:"⬡", desc:"Cross-chain" },
  { id:"dashboard", label:"Portfolio", icon:"▦", desc:"Overview" },
];

const BRIDGE_CHAINS = [
  { value:"Ethereum_Sepolia", label:"Ethereum Sepolia", icon:"Ξ" },
  { value:"Base_Sepolia",     label:"Base Sepolia",     icon:"B" },
  { value:"Arbitrum_Sepolia", label:"Arbitrum Sepolia", icon:"A" },
  { value:"Avalanche_Fuji",   label:"Avalanche Fuji",   icon:"▲" },
  { value:"OP_Sepolia",       label:"Optimism Sepolia", icon:"O" },
];

// ─── Swap (SimpleAMM) ─────────────────────────────────────────
async function executeSwap(tokenIn: string, tokenOut: string, amount: string): Promise<string> {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer   = await provider.getSigner();
  const parsed   = ethers.parseUnits(amount, 6);
  if (tokenIn === "USDC") {
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
    await (await usdc.approve(AMM_ADDRESS, parsed)).wait();
    const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, signer);
    const tx  = await amm.swapAtoB(parsed, 0n); await tx.wait(); return tx.hash;
  } else {
    const eurc = new ethers.Contract(EURC_ADDRESS, EURC_ABI, signer);
    await (await eurc.approve(AMM_ADDRESS, parsed)).wait();
    const amm = new ethers.Contract(AMM_ADDRESS, AMM_ABI, signer);
    const tx  = await amm.swapBtoA(parsed, 0n); await tx.wait(); return tx.hash;
  }
}

// ─── Bridge (redirect ke Circle CCTP bridge resmi) ────────────
async function executeBridge(fromChain: string, amount: string): Promise<string> {
  window.open("https://www.circle.com/multichain-usdc/cctp", "_blank");
  throw new Error("Redirect to Circle Bridge");
}

// ─── Cards ────────────────────────────────────────────────────
function SwapCard({ data, onExecute }: { data: Message["cardData"]; onExecute: ()=>void }) {
  return (
    <div className="relative overflow-hidden bg-[#0f0a1e] border border-violet-500/25 rounded-2xl p-5 max-w-xs w-full shadow-2xl shadow-violet-900/20">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-transparent to-fuchsia-600/5 pointer-events-none"/>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent"/>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs">⇄</div>
        <span className="text-violet-300/80 font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">Swap Request</span>
      </div>
      <div className="space-y-2 mb-4">
        <div className="bg-black/30 border border-white/5 rounded-xl p-3">
          <p className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mb-1">You Pay</p>
          <p className="text-xl font-bold text-white font-mono">{data?.amount} <span className="text-sm text-blue-400">{data?.tokenIn}</span></p>
        </div>
        <div className="flex justify-center"><div className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-[10px]">↓</div></div>
        <div className="bg-black/30 border border-white/5 rounded-xl p-3">
          <p className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mb-1">You Receive</p>
          <p className="text-xl font-bold text-white font-mono">~{data?.amount} <span className="text-sm text-violet-400">{data?.tokenOut}</span></p>
        </div>
      </div>
      {data?.reason && <p className="text-[10px] text-gray-500 font-mono italic mb-3 px-1">💡 {data.reason}</p>}
      <button onClick={onExecute} className="w-full relative overflow-hidden bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl font-mono text-xs transition-all active:scale-95 group">
        <span className="relative z-10">⚡ Execute Swap</span>
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 opacity-0 group-hover:opacity-100 transition-opacity"/>
      </button>
    </div>
  );
}

function SendCard({ data, onConfirm, onCancel }: { data: Message["cardData"]; onConfirm: ()=>void; onCancel: ()=>void }) {
  return (
    <div className="relative overflow-hidden bg-[#061418] border border-cyan-500/25 rounded-2xl p-5 max-w-xs w-full shadow-2xl shadow-cyan-900/20">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/5 via-transparent to-teal-600/5 pointer-events-none"/>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"/>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xs">↗</div>
        <span className="text-cyan-300/80 font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">Transfer</span>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
          <span className="text-[10px] text-gray-500 font-mono uppercase">Amount</span>
          <span className="text-cyan-300 font-mono font-bold text-sm">{data?.amount} {data?.token||"USDC"}</span>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
          <p className="text-[9px] text-gray-600 font-mono uppercase mb-1.5">To</p>
          <p className="text-white font-mono text-[11px] break-all leading-relaxed">{data?.to}</p>
        </div>
      </div>
      {data?.reason && <p className="text-[10px] text-gray-500 font-mono italic mb-3 px-1">💡 {data.reason}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/8 border border-white/10 text-gray-400 font-bold py-2.5 rounded-xl font-mono text-xs transition-all">Cancel</button>
        <button onClick={onConfirm} className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-2.5 rounded-xl font-mono text-xs transition-all active:scale-95">✓ Confirm</button>
      </div>
    </div>
  );
}

function BridgeCard({ data, onExecute }: { data: Message["cardData"]; onExecute: ()=>void }) {
  return (
    <div className="relative overflow-hidden bg-[#060a18] border border-blue-500/25 rounded-2xl p-5 max-w-xs w-full shadow-2xl shadow-blue-900/20">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-indigo-600/5 pointer-events-none"/>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"/>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs">⬡</div>
        <span className="text-blue-300/80 font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">CCTP v2 Bridge</span>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-gray-600 font-mono uppercase mb-1">From</p>
            <p className="text-white font-mono text-xs font-bold">{data?.fromChain?.replace(/_/g," ")}</p>
          </div>
          <div className="text-blue-400 text-sm">→</div>
          <div className="flex-1 bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-gray-600 font-mono uppercase mb-1">To</p>
            <p className="text-cyan-400 font-mono text-xs font-bold">ARC Testnet</p>
          </div>
        </div>
        <div className="flex justify-between items-center bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
          <span className="text-[10px] text-gray-500 font-mono uppercase">Amount</span>
          <span className="text-blue-300 font-mono font-bold text-sm">{data?.amount} USDC</span>
        </div>
      </div>
      {data?.reason && <p className="text-[10px] text-gray-500 font-mono italic mb-3 px-1">💡 {data.reason}</p>}
      <button onClick={onExecute} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl font-mono text-xs transition-all active:scale-95">⬡ Bridge via CCTP v2</button>
    </div>
  );
}

// ─── Wallet Modal ─────────────────────────────────────────────
function WalletModal({ onClose, onConnect }: { onClose: ()=>void; onConnect: (id: string)=>void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md"/>
      <div className="relative bg-[#0a0c14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-base">Connect Wallet</h2>
              <p className="text-gray-500 text-xs mt-0.5 font-mono">Select your wallet provider</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all text-sm">✕</button>
          </div>
        </div>
        {/* Wallet list */}
        <div className="px-4 pb-4 space-y-1.5">
          {WALLET_PROVIDERS.map(w => (
            <button key={w.id} onClick={()=>onConnect(w.id)}
              className="w-full flex items-center gap-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl px-4 py-3.5 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0">{w.icon}</div>
              <div className="text-left flex-1">
                <p className="text-white font-semibold text-sm">{w.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{w.subtitle}</p>
              </div>
              <span className="text-gray-600 group-hover:text-gray-300 text-sm transition-colors">→</span>
            </button>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-center text-gray-600 text-[11px]">By connecting you agree to our Terms of Service</p>
        </div>
      </div>
    </div>
  );
}

// ─── Glow dot animation ───────────────────────────────────────
function GlowDot({ color = "emerald" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-50`}/>
      <span className={`relative inline-flex rounded-full h-2 w-2 bg-${color}-400`}/>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function Home() {
  const [wallet, setWallet]                     = useState("");
  const [walletName, setWalletName]             = useState("");
  const [usdcBal, setUsdcBal]                   = useState("0.00");
  const [eurcBal, setEurcBal]                   = useState("0.00");
  const [txCount, setTxCount]                   = useState(0);
  const [activeTab, setActiveTab]               = useState<Tab>("agent");
  const [showWalletMenu, setShowWalletMenu]     = useState(false);
  const [showWalletModal, setShowWalletModal]   = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat
  const [messages, setMessages] = useState<Message[]>([
    { role:"ai", content:"Selamat datang di ARC AI DApp! 👋\nHubungkan wallet, lalu beri perintah:\n• 'swap 5 USDC ke EURC'\n• 'kirim 2 USDC ke 0x...'\n• 'bridge 10 USDC dari Ethereum Sepolia'\n• 'what is Arc Testnet?'" }
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);

  // Send
  const [sendTo, setSendTo]         = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken]   = useState<"USDC"|"EURC">("USDC");
  const [txStatus, setTxStatus]     = useState("");

  // Swap
  const [swapAmount, setSwapAmount]   = useState("");
  const [swapFrom, setSwapFrom]       = useState<"USDC"|"EURC">("USDC");
  const [swapTo, setSwapTo]           = useState<"USDC"|"EURC">("EURC");
  const [swapStatus, setSwapStatus]   = useState("");
  const [swapLoading, setSwapLoading] = useState(false);

  // Bridge
  const [bridgeFromChain, setBridgeFromChain] = useState("Ethereum_Sepolia");
  const [bridgeAmount, setBridgeAmount]       = useState("");
  const [bridgeLoading, setBridgeLoading]     = useState(false);
  const [bridgeStatus, setBridgeStatus]       = useState("");
  const [bridgeTxHash, setBridgeTxHash]       = useState("");
  const [bridgeSrcBalance, setBridgeSrcBalance] = useState("");
  const [bridgeSwitching, setBridgeSwitching]   = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);
  useEffect(()=>{
    const h = ()=>setShowWalletMenu(false);
    if (showWalletMenu) document.addEventListener("click", h);
    return ()=>document.removeEventListener("click", h);
  }, [showWalletMenu]);

  // ─── Helpers ────────────────────────────────────────────────
  async function refreshBalances(addr: string, provider: ethers.BrowserProvider) {
    try {
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const eurc = new ethers.Contract(EURC_ADDRESS, EURC_ABI, provider);
      const [uB, eB] = await Promise.all([usdc.balanceOf(addr), eurc.balanceOf(addr)]);
      setUsdcBal(parseFloat(ethers.formatUnits(uB, 6)).toFixed(2));
      setEurcBal(parseFloat(ethers.formatUnits(eB, 6)).toFixed(2));
    } catch {}
  }

  async function connectWallet(walletId: string) {
    setShowWalletModal(false);
    const eth = (window as any).ethereum;
    if (!eth) { alert("Wallet tidak ditemukan!"); return; }
    try {
      await switchToArc();
      const provider = new ethers.BrowserProvider(eth);
      const signer   = await provider.getSigner();
      const addr     = await signer.getAddress();
      setWallet(addr);
      setWalletName(WALLET_PROVIDERS.find(w=>w.id===walletId)?.name || "Wallet");
      await refreshBalances(addr, provider);
    } catch (e: any) { alert("Gagal connect: " + e.message); }
  }

  function disconnectWallet() {
    setWallet(""); setWalletName(""); setUsdcBal("0.00"); setEurcBal("0.00");
    setTxCount(0); setShowWalletMenu(false);
    setMessages([{ role:"ai", content:"Wallet terputus. Connect wallet kembali untuk mulai." }]);
  }

  // ─── AI Agent ───────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput("");
    setMessages(prev=>[...prev, { role:"user", content:userMsg }]);
    setLoading(true);
    try {
      const res  = await fetch("/api/agent", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message:userMsg, walletAddress:wallet, balance:usdcBal }),
      });
      const data = await res.json();
      if (data.type === "transaction") {
        const d = data.data;
        if (d.action === "send")
          setMessages(prev=>[...prev, { role:"ai", content:"", cardType:"send", cardData:d }]);
        else if (d.action === "swap")
          setMessages(prev=>[...prev, { role:"ai", content:"", cardType:"swap", cardData:d }]);
        else if (d.action === "bridge")
          setMessages(prev=>[...prev, { role:"ai", content:"", cardType:"bridge", cardData:d }]);
        else
          setMessages(prev=>[...prev, { role:"ai", content:JSON.stringify(d) }]);
      } else {
        setMessages(prev=>[...prev, { role:"ai", content: typeof data.data==="string" ? data.data : JSON.stringify(data.data) }]);
      }
    } catch (e: any) {
      setMessages(prev=>[...prev, { role:"ai", content:"❌ Error: " + e.message }]);
    }
    setLoading(false);
  }

  async function executeSend(to: string, amount: string, token: string, msgIndex: number) {
    setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ ...m, cardType:"pending", content:"Processing transfer..." }:m));
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer   = await provider.getSigner();
      const addr = token==="EURC" ? EURC_ADDRESS : USDC_ADDRESS;
      const abi  = token==="EURC" ? EURC_ABI : USDC_ABI;
      const contract = new ethers.Contract(addr, abi, signer);
      const tx = await contract.transfer(to, ethers.parseUnits(amount, 6));
      await tx.wait();
      setTxCount(c=>c+1);
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:`Sent ${amount} ${token} to ${to.slice(0,6)}...${to.slice(-4)}`, cardType:"success", txHash:tx.hash }:m));
      await refreshBalances(wallet, provider);
    } catch (e: any) {
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:"Transfer failed: "+e.message, cardType:"error" }:m));
    }
  }

  async function executeSwapFromAgent(cardData: Message["cardData"], msgIndex: number) {
    setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ ...m, cardType:"pending", content:"Swapping..." }:m));
    try {
      const txHash = await executeSwap(cardData?.tokenIn!, cardData?.tokenOut!, cardData?.amount!);
      setTxCount(c=>c+1);
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:`Swapped ${cardData?.amount} ${cardData?.tokenIn} → ${cardData?.tokenOut}`, cardType:"success", txHash }:m));
      await refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
    } catch (e: any) {
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:"Swap failed: "+e.message, cardType:"error" }:m));
    }
  }

  async function executeBridgeFromAgent(cardData: Message["cardData"], msgIndex: number) {
    setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ ...m, cardType:"pending", content:"Bridging via CCTP v2..." }:m));
    try {
      const txHash = await executeBridge(cardData?.fromChain || "Ethereum_Sepolia", cardData?.amount!);
      setTxCount(c=>c+1);
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:`Bridged ${cardData?.amount} USDC from ${cardData?.fromChain?.replace(/_/g," ")} → ARC`, cardType:"success", txHash }:m));
      await refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
    } catch (e: any) {
      setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:"Bridge failed: "+e.message, cardType:"error" }:m));
    }
  }

  function cancelAction(msgIndex: number) {
    setMessages(prev=>prev.map((m,i)=>i===msgIndex?{ role:"ai", content:"Transaction cancelled." }:m));
  }

  // ─── Manual Send ─────────────────────────────────────────────
  async function handleManualSend() {
    if (!sendTo||!sendAmount||!wallet) return;
    setTxStatus("⏳ Waiting for confirmation...");
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer   = await provider.getSigner();
      const addr = sendToken==="USDC" ? USDC_ADDRESS : EURC_ADDRESS;
      const abi  = sendToken==="USDC" ? USDC_ABI : EURC_ABI;
      const contract = new ethers.Contract(addr, abi, signer);
      const tx = await contract.transfer(sendTo, ethers.parseUnits(sendAmount, 6));
      await tx.wait();
      setTxCount(c=>c+1);
      setTxStatus(`✅ TX: ${tx.hash.slice(0,10)}...${tx.hash.slice(-6)}`);
      setSendTo(""); setSendAmount("");
      await refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
    } catch (e: any) { setTxStatus("❌ "+e.message.slice(0,80)); }
  }

  // ─── Manual Swap ─────────────────────────────────────────────
  async function handleSwap() {
    if (!swapAmount||!wallet||swapFrom===swapTo) return;
    setSwapLoading(true); setSwapStatus("⏳ Processing swap...");
    try {
      const txHash = await executeSwap(swapFrom, swapTo, swapAmount);
      setTxCount(c=>c+1);
      setSwapStatus(`✅ Swap done! TX: ${txHash.slice(0,10)}...`);
      setSwapAmount("");
      await refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
    } catch (e: any) { setSwapStatus("❌ "+e.message.slice(0,80)); }
    setSwapLoading(false);
  }

  function flipSwap() { setSwapFrom(swapTo); setSwapTo(swapFrom); }

  // ─── Bridge chain switch + balance fetch ─────────────────────
  async function handleBridgeChainChange(chain: string) {
    setBridgeFromChain(chain);
    setBridgeSrcBalance("");
    if (!wallet) return;
    setBridgeSwitching(true);
    try {
      const cfg = BRIDGE_CHAIN_CONFIG[chain];
      const eth = (window as any).ethereum;
      try {
        await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId: cfg.chainIdHex }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await eth.request({
            method:"wallet_addEthereumChain",
            params:[{
              chainId: cfg.chainIdHex, chainName: cfg.name,
              rpcUrls:[cfg.rpc],
              nativeCurrency:{ name:cfg.symbol, symbol:cfg.symbol, decimals:18 },
            }],
          });
        } else throw switchErr;
      }
      const prov = new ethers.BrowserProvider(eth);
      const usdc = new ethers.Contract(BRIDGE_USDC_ADDRESS[chain], USDC_ABI, prov);
      const bal  = await usdc.balanceOf(wallet);
      setBridgeSrcBalance(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e: any) {
      console.warn("Chain switch error:", e.message);
    }
    setBridgeSwitching(false);
  }

  // ─── Bridge with auto-switch ──────────────────────────────────
  async function handleBridge() {
    if (!bridgeAmount||!wallet) return;
    setBridgeLoading(true);
    setBridgeStatus("⏳ Switching to " + BRIDGE_CHAIN_CONFIG[bridgeFromChain]?.name + "...");
    setBridgeTxHash("");
    try {
      const chainConfig = BRIDGE_CHAIN_CONFIG[bridgeFromChain];
      const eth = (window as any).ethereum;
      // Step 1: Switch to source chain
      try {
        await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId: chainConfig.chainIdHex }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await eth.request({
            method:"wallet_addEthereumChain",
            params:[{
              chainId: chainConfig.chainIdHex, chainName: chainConfig.name,
              rpcUrls:[chainConfig.rpc],
              nativeCurrency:{ name:chainConfig.symbol, symbol:chainConfig.symbol, decimals:18 },
            }],
          });
        } else throw switchErr;
      }
      // Step 2: Check USDC balance on source chain
      setBridgeStatus("⏳ Checking USDC balance on " + chainConfig.name + "...");
      const provider  = new ethers.BrowserProvider(eth);
      const usdcAddr  = BRIDGE_USDC_ADDRESS[bridgeFromChain];
      const usdcCon   = new ethers.Contract(usdcAddr, USDC_ABI, provider);
      const bal       = await usdcCon.balanceOf(wallet);
      const balFmt    = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2);
      setBridgeSrcBalance(balFmt);
      if (parseFloat(balFmt) < parseFloat(bridgeAmount)) {
        setBridgeStatus(`❌ Insufficient USDC on ${chainConfig.name}. Balance: ${balFmt} USDC`);
        setBridgeLoading(false);
        return;
      }
      // Step 3: Execute bridge
      setBridgeStatus("⏳ Bridging via CCTP v2... Please confirm in wallet.");
      const txHash = await executeBridge(bridgeFromChain, bridgeAmount);
      setBridgeTxHash(txHash);
      setBridgeStatus(`✅ Bridge submitted! ${bridgeAmount} USDC en route to ARC (~2–5 min)`);
      setBridgeAmount("");
      // Step 4: Auto-switch back to ARC
      setTimeout(async () => {
        try {
          await switchToArc();
          await refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
        } catch {}
      }, 2000);
    } catch (e: any) {
      setBridgeStatus("❌ " + e.message.slice(0, 120));
    }
    setBridgeLoading(false);
  }

  const totalUSD = parseFloat(usdcBal) + parseFloat(eurcBal);

  // ─── Status pill helper ───────────────────────────────────────
  function StatusPill({ text }: { text: string }) {
    const isOk  = text.startsWith("✅");
    const isErr = text.startsWith("❌");
    return (
      <div className={`rounded-xl px-4 py-3 text-xs font-mono text-center border ${
        isOk  ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300" :
        isErr ? "bg-red-500/8 border-red-500/20 text-red-300" :
                "bg-amber-500/8 border-amber-500/20 text-amber-300"
      }`}>{text}</div>
    );
  }

  // ─── Input shared style ───────────────────────────────────────
  const inputCls = "w-full bg-white/[0.03] border border-white/[0.08] focus:border-white/20 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700";

  return (
    <main className="flex h-screen bg-[#05060d] text-white overflow-hidden" style={{ fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>
      {showWalletModal && <WalletModal onClose={()=>setShowWalletModal(false)} onConnect={connectWallet}/>}

      {/* ── Sidebar ── */}
      <aside className={`relative flex flex-col border-r border-white/[0.06] bg-[#07080f] transition-all duration-300 ease-in-out ${sidebarCollapsed?"w-[60px]":"w-52"} flex-shrink-0`}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/[0.06] ${sidebarCollapsed?"justify-center":""}`}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-lg shadow-cyan-500/25">A</div>
          {!sidebarCollapsed && (
            <div>
              <p className="text-white font-bold text-sm tracking-widest">ARC HUB</p>
              <p className="text-[10px] text-gray-600 font-mono">Chain 5042002</p>
            </div>
          )}
        </div>
        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={()=>setActiveTab(item.id)}
              title={sidebarCollapsed ? item.label : ""}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                activeTab===item.id
                  ? "bg-white/[0.07] border border-white/10 text-white"
                  : "text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]"
              } ${sidebarCollapsed?"justify-center":""}`}>
              <span className={`text-sm flex-shrink-0 ${activeTab===item.id?"text-cyan-400":""}`}>{item.icon}</span>
              {!sidebarCollapsed && (
                <div className="text-left min-w-0">
                  <p className="text-xs font-semibold leading-none">{item.label}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5 font-mono">{item.desc}</p>
                </div>
              )}
              {!sidebarCollapsed && activeTab===item.id && (
                <div className="ml-auto w-1 h-4 rounded-full bg-cyan-400/60"/>
              )}
            </button>
          ))}
        </nav>
        {/* Wallet status in sidebar */}
        {wallet && !sidebarCollapsed && (
          <div className="mx-3 mb-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <GlowDot color="emerald"/>
              <p className="text-[10px] text-emerald-400 font-mono">Connected</p>
            </div>
            <p className="text-xs text-gray-300 font-mono truncate">{wallet.slice(0,6)}...{wallet.slice(-4)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{walletName}</p>
          </div>
        )}
        {/* Collapse button */}
        <button onClick={()=>setSidebarCollapsed(c=>!c)}
          className="mx-2 mb-3 py-2 rounded-xl text-gray-700 hover:text-gray-400 hover:bg-white/[0.03] transition-all text-xs flex items-center justify-center gap-1.5">
          <span>{sidebarCollapsed?"→":"←"}</span>
          {!sidebarCollapsed && <span className="text-[10px]">Collapse</span>}
        </button>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] bg-[#07080f]/90 backdrop-blur-sm flex-shrink-0">
          <div>
            <h1 className="text-white font-bold text-sm tracking-widest uppercase">{NAV_ITEMS.find(n=>n.id===activeTab)?.label}</h1>
            <p className="text-[11px] text-gray-600 mt-0.5 font-mono">Arc Testnet · USDC Gas</p>
          </div>
          {wallet ? (
            <div className="relative" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>setShowWalletMenu(v=>!v)}
                className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-white/[0.15] rounded-xl px-4 py-2.5 transition-all group">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <GlowDot color="emerald"/>
                    <span className="text-xs text-white font-mono">{wallet.slice(0,6)}...{wallet.slice(-4)}</span>
                  </div>
                  <span className="text-[11px] text-gray-500 font-mono">{usdcBal} USDC · {eurcBal} EURC</span>
                </div>
                <span className="text-gray-600 text-xs group-hover:text-gray-400">▾</span>
              </button>
              {showWalletMenu && (
                <div className="absolute right-0 top-14 w-56 bg-[#0a0c14] border border-white/10 rounded-2xl shadow-2xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">via {walletName}</p>
                    <p className="text-xs text-white font-mono mt-1">{wallet.slice(0,12)}...{wallet.slice(-8)}</p>
                  </div>
                  <div className="py-1">
                    {[
                      { icon:"⟳", label:"Refresh Balance", action:()=>{ refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum)); setShowWalletMenu(false); } },
                      { icon:"↗", label:"View on Explorer", action:()=>window.open(`https://testnet.arcscan.app/address/${wallet}`) },
                      { icon:"⇄", label:"Switch Wallet", action:()=>{ setShowWalletModal(true); setShowWalletMenu(false); } },
                    ].map((item, i) => (
                      <button key={i} onClick={item.action} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-300 hover:bg-white/5 font-mono transition-all">
                        <span className="text-gray-600 w-4">{item.icon}</span>{item.label}
                      </button>
                    ))}
                    <div className="border-t border-white/5 mt-1 pt-1">
                      <button onClick={disconnectWallet} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 font-mono transition-all">
                        <span className="w-4">⏏</span>Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={()=>setShowWalletModal(true)}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-5 py-2.5 rounded-xl text-xs font-mono transition-all active:scale-95 shadow-lg shadow-cyan-500/25">
              <span>⬡</span> Connect Wallet
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">

          {/* ════════════════════════════════════════
              TAB: AI AGENT
          ════════════════════════════════════════ */}
          {activeTab === "agent" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                    {m.cardType==="swap" && m.cardData ? (
                      <SwapCard data={m.cardData} onExecute={()=>executeSwapFromAgent(m.cardData, i)}/>
                    ) : m.cardType==="send" && m.cardData ? (
                      <SendCard data={m.cardData}
                        onConfirm={()=>executeSend(m.cardData!.to!, m.cardData!.amount!, m.cardData!.token||"USDC", i)}
                        onCancel={()=>cancelAction(i)}/>
                    ) : m.cardType==="bridge" && m.cardData ? (
                      <BridgeCard data={m.cardData} onExecute={()=>executeBridgeFromAgent(m.cardData, i)}/>
                    ) : m.cardType==="pending" ? (
                      <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 px-4 py-3 rounded-2xl text-xs text-amber-300 font-mono max-w-xs">
                        <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                        {m.content}
                      </div>
                    ) : m.cardType==="success" ? (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl px-4 py-3 max-w-xs">
                        <p className="text-emerald-300 font-mono text-xs">✓ {m.content}</p>
                        {m.txHash && <a href={`https://testnet.arcscan.app/tx/${m.txHash}`} target="_blank" className="block mt-1.5 text-cyan-400 text-[11px] underline font-mono">↗ View on ArcScan</a>}
                      </div>
                    ) : m.cardType==="error" ? (
                      <div className="bg-red-500/8 border border-red-500/20 px-4 py-3 rounded-2xl text-xs text-red-300 font-mono max-w-xs">✕ {m.content}</div>
                    ) : (
                      <div className={`max-w-xs px-4 py-3 rounded-2xl text-xs font-mono leading-relaxed whitespace-pre-wrap ${
                        m.role==="user"
                          ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-100"
                          : "bg-white/[0.04] border border-white/[0.08] text-gray-300"
                      }`}>
                        {m.content}
                        {m.txHash && <a href={`https://testnet.arcscan.app/tx/${m.txHash}`} target="_blank" className="block mt-1 text-cyan-400 text-[11px] underline">↗ Explorer</a>}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.08] px-4 py-3 rounded-2xl text-xs text-gray-500 font-mono">
                      <div className="flex gap-1">
                        {[0,1,2].map(n=>(
                          <div key={n} className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay:`${n*0.12}s` }}/>
                        ))}
                      </div>
                      AI is thinking...
                    </div>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
              {/* Input bar */}
              <div className="p-4 border-t border-white/[0.06] bg-[#07080f]/60 backdrop-blur-sm flex-shrink-0">
                <div className="flex gap-2.5 max-w-2xl">
                  <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()}
                    placeholder={wallet ? "Type a command... (Enter to send)" : "Connect wallet to start"}
                    disabled={!wallet||loading}
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-cyan-500/40 text-white rounded-xl px-4 py-3 text-xs outline-none font-mono placeholder:text-gray-700 transition-all disabled:opacity-30"/>
                  <button onClick={sendMessage} disabled={!wallet||loading||!input.trim()}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 text-black font-bold px-5 py-3 rounded-xl text-xs font-mono transition-all active:scale-95 shadow-lg shadow-cyan-500/20">
                    Send ↗
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: SEND
          ════════════════════════════════════════ */}
          {activeTab === "send" && (
            <div className="p-6 max-w-md">
              <div className="relative overflow-hidden bg-[#08090f] border border-white/[0.07] rounded-2xl">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"/>
                {/* Panel header */}
                <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">↗</div>
                  <div>
                    <h2 className="text-white font-bold text-sm">Send Tokens</h2>
                    <p className="text-[11px] text-gray-600 mt-0.5 font-mono">Transfer to any address on ARC</p>
                  </div>
                </div>
                <div className="p-6 space-y-5">
                  {/* Token selector */}
                  <div>
                    <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block mb-2">Token</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["USDC","EURC"] as const).map(t=>(
                        <button key={t} onClick={()=>setSendToken(t)}
                          className={`py-3 rounded-xl font-mono text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                            sendToken===t
                              ? "bg-white/[0.06] border-white/20 text-white"
                              : "bg-white/[0.02] border-white/[0.05] text-gray-600 hover:border-white/10 hover:text-gray-400"
                          }`}>
                          <span>{t==="USDC"?"🔵":"🟡"}</span> {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Recipient */}
                  <div>
                    <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block mb-2">Recipient</label>
                    <input value={sendTo} onChange={e=>setSendTo(e.target.value)} placeholder="0x..." className={inputCls}/>
                  </div>
                  {/* Amount */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Amount</label>
                      <button onClick={()=>setSendAmount(sendToken==="USDC"?usdcBal:eurcBal)}
                        className="text-[10px] text-cyan-500 hover:text-cyan-400 font-mono transition-colors">
                        MAX: {sendToken==="USDC"?usdcBal:eurcBal}
                      </button>
                    </div>
                    <input value={sendAmount} onChange={e=>setSendAmount(e.target.value)} placeholder="0.00" type="number" className={inputCls}/>
                  </div>
                  <button onClick={handleManualSend} disabled={!wallet||!sendTo||!sendAmount}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-25 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] shadow-lg shadow-cyan-500/20">
                    Confirm & Send ↗
                  </button>
                  {txStatus && <StatusPill text={txStatus}/>}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: SWAP
          ════════════════════════════════════════ */}
          {activeTab === "swap" && (
            <div className="p-6 max-w-md">
              <div className="relative overflow-hidden bg-[#08090f] border border-white/[0.07] rounded-2xl">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent"/>
                <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">⇄</div>
                  <div>
                    <h2 className="text-white font-bold text-sm">Swap Tokens</h2>
                    <p className="text-[11px] text-gray-600 mt-0.5 font-mono">Circle App Kit → SimpleAMM fallback</p>
                  </div>
                </div>
                <CircleSwap
                  wallet={wallet}
                  usdcBal={usdcBal}
                  eurcBal={eurcBal}
                  onSuccess={(txHash) => {
                    setTxCount(c=>c+1);
                    refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum));
                  }}
                />
              </div>
            </div>
          )}


          {/* ════════════════════════════════════════
              TAB: BRIDGE
          ════════════════════════════════════════ */}
          {activeTab === "bridge" && (
            <div className="p-6 max-w-2xl space-y-4">
              {/* Header */}
              <div className="relative overflow-hidden bg-[#08090f] border border-white/[0.07] rounded-2xl">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"/>
                <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">⬡</div>
                  <div>
                    <h2 className="text-white font-bold text-sm">Bridge USDC</h2>
                    <p className="text-[11px] text-gray-600 mt-0.5 font-mono">Circle CCTP v2 · Powered by Circle</p>
                  </div>
                </div>
                <CircleBridge
                  wallet={wallet}
                  onSuccess={(hash) => {
                    setTxCount(c=>c+1);
                  }}
                />
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-2">
                <a href="https://faucet.circle.com" target="_blank"
                  className="flex items-center justify-center gap-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-gray-400 font-bold py-3 rounded-xl font-mono text-xs transition-all">
                  🚰 Circle Faucet
                </a>
                <a href="https://testnet.arcscan.app" target="_blank"
                  className="flex items-center justify-center gap-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-gray-400 font-bold py-3 rounded-xl font-mono text-xs transition-all">
                  🔍 ArcScan
                </a>
              </div>
            </div>
          )}

          {/* dummy to close */}
          {/* ════════════════════════════════════════
              TAB: DASHBOARD
          ════════════════════════════════════════ */}
          {activeTab === "dashboard" && (
            <div className="p-6 space-y-4 max-w-2xl">
              {/* Portfolio hero */}
              <div className="relative overflow-hidden bg-[#08090f] border border-white/[0.07] rounded-2xl p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/5 via-transparent to-blue-600/5 pointer-events-none"/>
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"/>
                <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2">Total Portfolio</p>
                <p className="text-5xl font-bold text-white font-mono">${totalUSD.toFixed(2)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <GlowDot color="emerald"/>
                  <p className="text-[11px] text-emerald-400 font-mono">ARC Testnet · Live</p>
                </div>
              </div>

              {/* Token cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label:"USDC", value:usdcBal, icon:"🔵", accent:"from-blue-500/8 to-blue-500/3", border:"border-blue-500/15", text:"text-blue-300" },
                  { label:"EURC", value:eurcBal, icon:"🟡", accent:"from-yellow-500/8 to-yellow-500/3", border:"border-yellow-500/15", text:"text-yellow-300" },
                ].map((t, i) => (
                  <div key={i} className={`relative overflow-hidden bg-gradient-to-br ${t.accent} border ${t.border} rounded-2xl p-5`}>
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"/>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{t.icon}</span>
                      <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{t.label}</span>
                    </div>
                    <p className={`text-2xl font-bold font-mono ${t.text}`}>{t.value}</p>
                    <p className="text-[10px] text-gray-600 font-mono mt-1">${t.value} USD</p>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:"Session TXs", value:txCount.toString(), color:"text-emerald-400" },
                  { label:"Network", value:"ARC", color:"text-cyan-400" },
                  { label:"Chain ID", value:"5042002", color:"text-blue-400" },
                ].map((s, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Wallet info */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2">Connected Wallet</p>
                <p className="text-sm font-mono text-gray-300 break-all">{wallet||"—"}</p>
                {walletName && <p className="text-[11px] text-gray-600 font-mono mt-1.5">via {walletName}</p>}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>refreshBalances(wallet, new ethers.BrowserProvider((window as any).ethereum))}
                  disabled={!wallet}
                  className="bg-white/[0.03] hover:bg-white/[0.05] disabled:opacity-30 border border-white/[0.06] hover:border-white/[0.12] text-gray-400 font-bold py-3 rounded-xl font-mono text-xs transition-all">
                  ⟳ Refresh
                </button>
                <a href={`https://testnet.arcscan.app/address/${wallet}`} target="_blank"
                  className="flex items-center justify-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-gray-400 font-bold py-3 rounded-xl font-mono text-xs transition-all">
                  ↗ ArcScan
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
