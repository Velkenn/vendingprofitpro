import { useState, useEffect, useRef, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Receipt, BarChart3, Bot, Monitor, Camera, Smartphone, ArrowRight, CheckCircle, Zap, Shield } from "lucide-react";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    o.observe(el);
    return () => o.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

const features = [
  { icon: Camera, title: "Receipt Parsing", desc: "AI reads every receipt. Sam's Club, Walmart, Costco, Amazon — photo or PDF." },
  { icon: BarChart3, title: "SKU Profit Tracking", desc: "True cost, unit profit, and margin over time. Know what's actually making money." },
  { icon: Monitor, title: "Machine Management", desc: "Track revenue, cash vs credit split, and flag inactive machines." },
  { icon: Receipt, title: "Business Stats", desc: "Full analytics with performance rankings for best and worst SKUs." },
  { icon: Bot, title: "Chip AI Assistant", desc: "Ask your data anything in plain English. Proactive insights included." },
  { icon: Smartphone, title: "Works Like an App", desc: "Install to your home screen. No app store needed. iOS & Android." },
];

const steps = [
  { num: "1", title: "Sign up at vendingtrackr.com", desc: "Create your free account. No credit card required." },
  { num: "2", title: "Add a free Gemini API key", desc: "Get a free key from Google AI Studio in 2 minutes." },
  { num: "3", title: "Upload your first receipt", desc: "Photo or PDF from any store. AI extracts every line item." },
  { num: "4", title: "Enter your sell prices", desc: "Tell VendingTrackr what you charge. It calculates profit." },
  { num: "5", title: "Ask Chip anything", desc: "Your vending business advisor is ready." },
];

const chipConversations = [
  { q: "What store do I go to most?", a: "You visit Walmart the most." },
  { q: "What's my most profitable SKU?", a: "Frito-Lay Chips at $1.50 profit per unit." },
  { q: "How was March vs February?", a: "March was your best month yet!" },
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3.5 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(247,251,248,0.96)" : "hsl(153, 60%, 33%)",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid hsl(153, 20%, 85%)" : "none",
        }}
      >
        <span
          className="text-lg font-extrabold"
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            color: scrolled ? "hsl(153, 60%, 33%)" : "#fff",
          }}
        >
          VendingTrackr
        </span>
        <Link
          to="/auth"
          className="rounded-full px-5 py-2 text-sm font-bold transition-colors"
          style={{
            background: scrolled ? "hsl(153, 60%, 33%)" : "#fff",
            color: scrolled ? "#fff" : "hsl(153, 60%, 33%)",
          }}
        >
          Try It Free
        </Link>
      </nav>

      {/* Hero */}
      <section
        className="pt-24 pb-16 px-5 text-center"
        style={{ background: "linear-gradient(135deg, #0d5c2a 0%, hsl(153, 60%, 33%) 100%)" }}
      >
        <FadeIn>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold text-white/90 mb-5"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <Zap className="h-3 w-3" /> Built for Vending Operators
          </span>
          <h1
            className="text-white leading-tight mb-4"
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "clamp(32px, 8vw, 52px)",
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            Data, Not Guesswork,
            <br />
            for Your Vending Business
          </h1>
          <p className="text-white/80 mb-8 max-w-lg mx-auto" style={{ fontSize: "clamp(14px, 3.5vw, 17px)", lineHeight: 1.6 }}>
            AI-powered profit tracking built for vending machine operators. Snap a receipt, see your real margins.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold transition-transform hover:scale-105"
            style={{ background: "#0f1a12", color: "#fff" }}
          >
            Start Tracking Free <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-white/50 text-xs mt-4">app.vendingtrackr.com · No credit card needed</p>
        </FadeIn>
      </section>

      {/* Stats Row */}
      <FadeIn>
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto px-5 -mt-6">
          {[
            { label: "Receipts Parsed", value: "10,000+" },
            { label: "Avg Time Saved", value: "5 hrs/wk" },
            { label: "SKUs Tracked", value: "2,500+" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white p-3 text-center shadow-md">
              <p className="text-lg font-bold" style={{ color: "hsl(153, 60%, 33%)" }}>{s.value}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* Problem / Solution */}
      <section className="px-5 py-16 max-w-lg mx-auto space-y-4">
        <FadeIn>
          <h2 className="text-center text-xl font-bold mb-6" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            The Vending Operator's Dilemma
          </h2>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Problem</span>
            <p className="text-sm font-semibold mt-2 text-gray-800">Spreadsheets Take Forever. No Insights.</p>
            <p className="text-xs text-gray-500 mt-1">Manual data entry, no profit per SKU, no idea what's working.</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Problem</span>
            <p className="text-sm font-semibold mt-2 text-gray-800">Enterprise Software Costs Hundreds & Requires Hardware</p>
            <p className="text-xs text-gray-500 mt-1">Cantaloupe, Parlevel — $200+/mo per machine. Overkill for most operators.</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div className="rounded-xl border p-5" style={{ borderColor: "hsl(153, 30%, 80%)", background: "hsl(153, 60%, 97%)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(153, 60%, 33%)" }}>Solution</span>
            <p className="text-sm font-semibold mt-2 text-gray-800">Built for vending operators</p>
            <p className="text-xs text-gray-500 mt-1">Upload a receipt. See your profit. Ask Chip anything. Free to start.</p>
          </div>
        </FadeIn>
      </section>

      {/* Features */}
      <section className="px-5 py-16" style={{ background: "#f0faf4" }}>
        <FadeIn>
          <div className="text-center mb-10">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(153, 60%, 33%)" }}>Features</span>
            <h2 className="text-xl font-bold mt-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              Every feature solves a real problem
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.08}>
              <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
                <f.icon className="h-6 w-6 mb-3" style={{ color: "hsl(153, 60%, 33%)" }} />
                <p className="font-semibold text-sm mb-1">{f.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Chip AI Section */}
      <section className="px-5 py-16 max-w-lg mx-auto">
        <FadeIn>
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white mb-3"
              style={{ background: "hsl(153, 60%, 33%)" }}>
              CHIP
            </span>
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              Your AI Vending Advisor
            </h2>
            <p className="text-xs text-gray-500 mt-2">Chip has full access to your data and answers questions in plain English.</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-5 space-y-4" style={{ background: "#f7fbf8", borderColor: "hsl(153, 20%, 85%)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "hsl(153, 60%, 33%)" }}>
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold">Chip</p>
                <p className="text-[10px] text-gray-400">Your vending business assistant</p>
              </div>
            </div>
            {chipConversations.map((c, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md px-4 py-2 text-sm" style={{ background: "hsl(153, 60%, 33%)", color: "#fff" }}>
                    {c.q}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm border border-gray-100 shadow-sm text-gray-700">
                    {c.a}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* How It Works */}
      <section className="px-5 py-16" style={{ background: "#f0faf4" }}>
        <FadeIn>
          <div className="text-center mb-10">
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Up and running in minutes</h2>
            <p className="text-xs text-gray-500 mt-2">No complicated setup. No hardware required.</p>
          </div>
        </FadeIn>
        <div className="max-w-lg mx-auto space-y-3">
          {steps.map((s, i) => (
            <FadeIn key={s.num} delay={i * 0.08}>
              <div className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: "hsl(153, 60%, 33%)" }}
                >
                  {s.num}
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Tech Stack / Powered By */}
      <FadeIn>
        <section className="px-5 py-12 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Powered by</p>
          <div className="flex items-center justify-center gap-6 text-gray-400">
            <div className="flex items-center gap-1.5">
              <Shield className="h-5 w-5" />
              <span className="text-xs font-semibold">Supabase</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-5 w-5" />
              <span className="text-xs font-semibold">Google Gemini</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-5 w-5" />
              <span className="text-xs font-semibold">React</span>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Testimonial */}
      <FadeIn>
        <section className="px-5 py-12 max-w-lg mx-auto text-center">
          <blockquote className="text-sm italic text-gray-600 leading-relaxed">
            "I had no idea which products were actually making me money. VendingTrackr shows me exactly where my profit is — and where I'm losing it."
          </blockquote>
          <p className="text-xs text-gray-400 mt-3">Vending operator · 12 machines</p>
        </section>
      </FadeIn>

      {/* Final CTA */}
      <section
        className="px-5 py-16 text-center"
        style={{ background: "linear-gradient(135deg, #0d5c2a 0%, hsl(153, 60%, 33%) 100%)" }}
      >
        <FadeIn>
          <h2
            className="text-white text-2xl font-bold mb-3"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            Ready to know your numbers?
          </h2>
          <p className="text-white/70 text-sm mb-8 max-w-md mx-auto">
            No complicated setup. No hardware required. Just snap a receipt and go.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold transition-transform hover:scale-105"
            style={{ background: "#fff", color: "hsl(153, 60%, 33%)" }}
          >
            Start Tracking Free <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-white/40 text-xs mt-4">app.vendingtrackr.com · No credit card needed</p>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="px-5 py-8 text-center" style={{ background: "#0f1a12" }}>
        <p
          className="text-white/80 text-sm font-bold mb-2"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          VendingTrackr
        </p>
        <p className="text-white/40 text-xs">
          VendingTrackr © {new Date().getFullYear()} · vendingtrackr.com
        </p>
        <p className="text-white/30 text-[10px] mt-1">
          Built by a real vending operator in Michigan
        </p>
      </footer>
    </div>
  );
}
