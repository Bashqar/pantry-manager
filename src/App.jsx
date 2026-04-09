import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, Plus, Trash2, Edit3, X, AlertTriangle, Package, ShoppingCart, BarChart3, CheckCircle, XCircle, TrendingUp, Bell, Settings, RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";

const CATEGORIES = ["Dairy", "Meat", "Produce", "Bakery", "Beverages", "Snacks", "Frozen", "Canned", "Condiments", "Grains", "Cleaning", "Personal Care", "Other"];
const STORES = ["Albert Heijn", "Jumbo", "Lidl", "Aldi", "Plus", "Dirk", "Other"];
const STATUSES = ["Not Opened", "Opened", "Finished", "Expired"];
const EXPIRY_RULES = { "Milk": 5, "Yogurt": 7, "Cheese": 10, "Hummus": 5, "Cream": 4, "Juice": 7, "Butter": 14 };

const today = new Date();
const fmt = (d) => d?.toISOString?.()?.split("T")[0] || d || "";
const parseDate = (s) => s ? new Date(s + "T00:00:00") : null;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a, b) => Math.ceil((parseDate(a) - parseDate(b)) / 86400000);

const SAMPLE_DATA = [
  { id: 1, name: "Whole Milk", category: "Dairy", store: "Albert Heijn", price: 1.89, buyDate: "2026-04-05", expiryDate: "2026-04-15", openDate: "2026-04-07", mandatory: true, status: "Opened", notes: "" },
  { id: 2, name: "Sourdough Bread", category: "Bakery", store: "Jumbo", price: 3.49, buyDate: "2026-04-07", expiryDate: "2026-04-12", openDate: "", mandatory: true, status: "Not Opened", notes: "" },
  { id: 3, name: "Greek Yogurt", category: "Dairy", store: "Albert Heijn", price: 2.29, buyDate: "2026-04-01", expiryDate: "2026-04-10", openDate: "2026-04-03", mandatory: false, status: "Opened", notes: "" },
  { id: 4, name: "Chicken Breast", category: "Meat", store: "Lidl", price: 5.99, buyDate: "2026-04-06", expiryDate: "2026-04-11", openDate: "", mandatory: true, status: "Not Opened", notes: "" },
  { id: 5, name: "Orange Juice", category: "Beverages", store: "Albert Heijn", price: 2.49, buyDate: "2026-03-30", expiryDate: "2026-04-08", openDate: "2026-04-01", mandatory: true, status: "Expired", notes: "" },
  { id: 6, name: "Cheddar Cheese", category: "Dairy", store: "Jumbo", price: 4.59, buyDate: "2026-04-02", expiryDate: "2026-04-22", openDate: "", mandatory: false, status: "Not Opened", notes: "" },
  { id: 7, name: "Pasta", category: "Grains", store: "Lidl", price: 0.99, buyDate: "2026-03-15", expiryDate: "2027-03-15", openDate: "", mandatory: true, status: "Not Opened", notes: "" },
  { id: 8, name: "Frozen Pizza", category: "Frozen", store: "Lidl", price: 3.29, buyDate: "2026-04-01", expiryDate: "2026-07-01", openDate: "", mandatory: false, status: "Not Opened", notes: "" },
];

const getEffectiveExpiry = (item) => {
  if (item.effectiveExpiry) return item.effectiveExpiry;
  if (item.openDate) {
    for (const [key, days] of Object.entries(EXPIRY_RULES)) {
      if (item.name.toLowerCase().includes(key.toLowerCase())) {
        const openExp = fmt(addDays(parseDate(item.openDate), days));
        return openExp < item.expiryDate ? openExp : item.expiryDate;
      }
    }
  }
  return item.expiryDate;
};

const getExpiryUrgency = (item) => {
  if (item.status === "Finished" || item.status === "Expired") return null;
  const d = diffDays(getEffectiveExpiry(item), fmt(today));
  if (d < 0) return "expired";
  if (d <= 3) return "critical";
  if (d <= 7) return "warning";
  return "ok";
};

const Badge = ({ children, color = "gray" }) => {
  const c = { red: { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" }, orange: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" }, green: { bg: "#f0fdf4", fg: "#166534", bd: "#bbf7d0" }, blue: { bg: "#eff6ff", fg: "#1e40af", bd: "#bfdbfe" }, gray: { bg: "#f9fafb", fg: "#374151", bd: "#e5e7eb" }, purple: { bg: "#faf5ff", fg: "#6b21a8", bd: "#e9d5ff" }, yellow: { bg: "#fefce8", fg: "#854d0e", bd: "#fef08a" } }[color];
  return <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, letterSpacing: "0.02em", whiteSpace: "nowrap", background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>{children}</span>;
};

const statusColor = (s) => ({ "Not Opened": "blue", "Opened": "green", "Finished": "gray", "Expired": "red" }[s] || "gray");

// ==========================================
// API Layer — CORS-safe via GET params
// Google Apps Script blocks cross-origin POST
// so we pass everything as GET query params
// ==========================================
const createApi = () => {
  let url = null;

  const call = async (params) => {
    if (!url) return null;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error("Invalid response: " + text.substring(0, 200)); }
  };

  return {
    setUrl(u) { url = u; },
    getUrl() { return url; },
    async fetchItems() {
      const data = await call({ action: "list" });
      if (data?.success) return data.items;
      throw new Error(data?.error || "Failed to fetch");
    },
    async addItem(item) {
      return call({ action: "add", data: JSON.stringify(item) });
    },
    async updateItem(item) {
      return call({ action: "update", data: JSON.stringify(item) });
    },
    async deleteItem(id) {
      return call({ action: "delete", data: JSON.stringify({ id }) });
    },
  };
};

const api = createApi();

export default function GroceryManager() {
  const [items, setItems] = useState(SAMPLE_DATA);
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [summaryPeriod, setSummaryPeriod] = useState("monthly");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const emptyItem = { name: "", category: "Dairy", store: "Albert Heijn", price: "", buyDate: fmt(today), expiryDate: "", openDate: "", mandatory: false, status: "Not Opened", notes: "" };
  const [form, setForm] = useState(emptyItem);

  const connectApi = useCallback(async (url) => {
    if (!url) return;
    setLoading(true);
    setSyncStatus("syncing");
    try {
      api.setUrl(url);
      const data = await api.fetchItems();
      if (data) { setItems(data); setConnected(true); setSyncStatus("synced"); setTimeout(() => setSyncStatus(""), 2000); }
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setConnected(false);
      api.setUrl(null);
    } finally { setLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    if (!connected) return;
    setSyncStatus("syncing");
    try {
      const data = await api.fetchItems();
      if (data) setItems(data);
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus(""), 2000);
    } catch { setSyncStatus("error"); }
  }, [connected]);

  const openAdd = () => { setForm(emptyItem); setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...item, price: String(item.price) }); setEditItem(item.id); setShowForm(true); };

  const saveItem = async () => {
    if (!form.name || !form.expiryDate) return;
    const entry = { ...form, price: parseFloat(form.price) || 0 };
    if (connected) {
      setSyncStatus("syncing");
      try {
        if (editItem) await api.updateItem({ ...entry, id: editItem });
        else await api.addItem(entry);
        await refresh();
      } catch { setSyncStatus("error"); }
    } else {
      if (editItem) setItems(prev => prev.map(i => i.id === editItem ? { ...entry, id: editItem } : i));
      else setItems(prev => [...prev, { ...entry, id: Date.now() }]);
    }
    setShowForm(false);
  };

  const deleteItem = async (id) => {
    if (connected) {
      setSyncStatus("syncing");
      try { await api.deleteItem(id); await refresh(); } catch { setSyncStatus("error"); }
    } else { setItems(prev => prev.filter(i => i.id !== id)); }
  };

  const filtered = useMemo(() => items.filter(i =>
    (filterCat === "All" || i.category === filterCat) &&
    (filterStatus === "All" || i.status === filterStatus) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  ), [items, filterCat, filterStatus, search]);

  const alerts = useMemo(() => ({
    expiringThisWeek: items.filter(i => { const u = getExpiryUrgency(i); return u === "critical" || u === "expired"; }),
    expiringThisMonth: items.filter(i => { if (i.status === "Finished" || i.status === "Expired") return false; const d = diffDays(getEffectiveExpiry(i), fmt(today)); return d >= 0 && d <= 30; }),
    missingMandatory: items.filter(i => i.mandatory && (i.status === "Finished" || i.status === "Expired")),
  }), [items]);

  const analytics = useMemo(() => {
    const byPrice = [...items].sort((a, b) => b.price - a.price).slice(0, 10);
    const catSpend = {};
    items.forEach(i => { catSpend[i.category] = (catSpend[i.category] || 0) + i.price; });
    const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, total]) => ({ name, total }));
    const consumed = items.filter(i => i.status === "Finished");
    const expired = items.filter(i => i.status === "Expired");
    const nameCount = {};
    consumed.forEach(i => { nameCount[i.name] = (nameCount[i.name] || 0) + 1; });
    const topConsumed = Object.entries(nameCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    return { byPrice, topCats, topConsumed, expired, totalSpend: items.reduce((s, i) => s + i.price, 0), wastedSpend: expired.reduce((s, i) => s + i.price, 0) };
  }, [items]);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', sans-serif; background: #f8f7f4; color: #1a1a1a; }
    input, select, textarea, button { font-family: inherit; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
    @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .anim-in { animation: slideUp 0.3s ease-out; }
    .fade-in { animation: fadeIn 0.2s ease-out; }
    .spin { animation: spin 1s linear infinite; }
  `;
  const inp = { padding: "10px 12px", borderRadius: 8, border: "1px solid #e0ddd8", fontSize: 13, outline: "none", width: "100%", background: "#faf9f7" };

  const StatCard = ({ icon, label, value, sub, accent }) => (
    <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", border: "1px solid #e8e6e1", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: accent + "15", display: "flex", alignItems: "center", justifyContent: "center", color: accent, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#888", fontWeight: 500, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: accent, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );

  const BarRow = ({ label, value, max, color = "#1a1a1a", suffix = "" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ width: 120, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ flex: 1, height: 24, background: "#f4f3f0", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max((value / max) * 100, 4)}%`, background: color, borderRadius: 6, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500, width: 70, textAlign: "right" }}>{suffix}{typeof value === "number" ? (suffix === "€" ? value.toFixed(2) : value) : value}</div>
    </div>
  );

  const FormField = ({ label, children }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888" }}>{label}</label>
      {children}
    </div>
  );

  const AlertPanel = ({ title, icon, bgColor, fgColor, data, renderRow }) => (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0eeea", display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{ marginLeft: "auto", background: bgColor, color: fgColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>{data.length}</span>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {data.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#aaa", fontSize: 13 }}>All clear!</div> :
          data.map((item, i) => <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid #f8f7f4", display: "flex", alignItems: "center", gap: 12 }}>{renderRow(item)}</div>)}
      </div>
    </div>
  );

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <Package size={18} /> },
    { id: "items", label: "Groceries", icon: <ShoppingCart size={18} /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f4" }}>
      <style>{css}</style>

      {/* HEADER */}
      <div style={{ background: "white", borderBottom: "1px solid #e8e6e1", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}><ShoppingCart size={16} color="white" /></div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>Pantry</span>
          </div>
          <nav style={{ display: "flex", gap: 2, marginLeft: 8 }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setView(n.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: view === n.id ? "#f4f3f0" : "transparent", color: view === n.id ? "#1a1a1a" : "#888", fontWeight: view === n.id ? 600 : 400, fontSize: 13, cursor: "pointer" }}>
                {n.icon} {n.label}
              </button>
            ))}
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {syncStatus === "syncing" && <Loader2 size={14} className="spin" color="#888" />}
            {syncStatus === "synced" && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 500 }}>Synced</span>}
            {syncStatus === "error" && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 500 }}>Error</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, background: connected ? "#f0fdf4" : "#f9fafb", border: `1px solid ${connected ? "#bbf7d0" : "#e5e7eb"}`, fontSize: 11, fontWeight: 500, color: connected ? "#166534" : "#888" }}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />} {connected ? "Live" : "Demo"}
            </div>
            {connected && <button onClick={refresh} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer" }}><RefreshCw size={16} color="#888" /></button>}
            <button onClick={() => setShowSettings(true)} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer" }}><Settings size={18} color="#888" /></button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {{ dashboard: "Dashboard", items: "Groceries", analytics: "Analytics" }[view]}
          </h1>
          <p style={{ fontSize: 13, color: "#999", marginTop: 2 }}>
            {view === "dashboard" ? `${items.filter(i => i.status !== "Finished" && i.status !== "Expired").length} active items · ${fmt(today)}` : view === "items" ? `${filtered.length} items shown` : `${summaryPeriod} summary`}
          </p>
        </div>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {!connected && (
              <div style={{ background: "#fffbeb", border: "1px solid #fef08a", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <WifiOff size={16} color="#854d0e" />
                <span style={{ color: "#854d0e", flex: 1 }}><strong>Demo mode</strong> — sample data shown. Click <strong>Settings</strong> (⚙) to connect your Google Sheet.</span>
                <button onClick={() => setShowSettings(true)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #fbbf24", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#854d0e" }}>Connect</button>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <StatCard icon={<Package size={20} />} label="Active Items" value={items.filter(i => i.status !== "Finished" && i.status !== "Expired").length} accent="#2563eb" />
              <StatCard icon={<AlertTriangle size={20} />} label="Expiring Soon" value={alerts.expiringThisWeek.length} sub={alerts.expiringThisWeek.length > 0 ? "Needs attention" : "All good!"} accent={alerts.expiringThisWeek.length > 0 ? "#dc2626" : "#16a34a"} />
              <StatCard icon={<CheckCircle size={20} />} label="Missing Mandatory" value={alerts.missingMandatory.length} sub={alerts.missingMandatory.length > 0 ? "Restock needed" : "Fully stocked"} accent={alerts.missingMandatory.length > 0 ? "#ea580c" : "#16a34a"} />
              <StatCard icon={<TrendingUp size={20} />} label="Total Spend" value={`€${analytics.totalSpend.toFixed(2)}`} sub={`€${analytics.wastedSpend.toFixed(2)} wasted`} accent="#7c3aed" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              <AlertPanel title="Expiring This Week" icon={<AlertTriangle size={16} color="#dc2626" />} bgColor="#fee2e2" fgColor="#991b1b" data={alerts.expiringThisWeek} renderRow={item => { const d = diffDays(getEffectiveExpiry(item), fmt(today)); return <><div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div><div style={{ fontSize: 11, color: "#999" }}>{item.category} · {item.store}</div></div><Badge color={d < 0 ? "red" : "orange"}>{d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `${d}d left`}</Badge></>; }} />
              <AlertPanel title="Missing Mandatory" icon={<ShoppingCart size={16} color="#ea580c" />} bgColor="#fff7ed" fgColor="#9a3412" data={alerts.missingMandatory} renderRow={item => <><div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div><div style={{ fontSize: 11, color: "#999" }}>{item.category}</div></div><Badge color={item.status === "Expired" ? "red" : "gray"}>{item.status}</Badge></>} />
            </div>
          </div>
        )}

        {/* GROCERIES TABLE */}
        {view === "items" && (
          <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 200px", position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." style={{ ...inp, paddingLeft: 36 }} />
              </div>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value="All">All Statuses</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <button onClick={openAdd} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#1a1a1a", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><Plus size={15} /> Add Item</button>
            </div>
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#faf9f7", borderBottom: "1px solid #e8e6e1" }}>
                      {["Item", "Category", "Store", "Price", "Expiry", "Status", "Mand.", ""].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const urgency = getExpiryUrgency(item);
                      const eff = getEffectiveExpiry(item);
                      const dl = diffDays(eff, fmt(today));
                      return (
                        <tr key={item.id} style={{ borderBottom: "1px solid #f4f3f0" }} onMouseEnter={e => e.currentTarget.style.background = "#faf9f7"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "12px 16px", fontWeight: 500 }}>{item.name}{eff !== item.expiryDate && <span style={{ fontSize: 10, color: "#ea580c", marginLeft: 6 }}>⚡ adjusted</span>}</td>
                          <td style={{ padding: "12px 16px" }}><Badge color="purple">{item.category}</Badge></td>
                          <td style={{ padding: "12px 16px", color: "#666" }}>{item.store}</td>
                          <td style={{ padding: "12px 16px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>€{item.price.toFixed(2)}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, color: "#666" }}>{eff}</span>
                              {urgency === "expired" && <Badge color="red">Expired</Badge>}
                              {urgency === "critical" && <Badge color="orange">{dl}d</Badge>}
                              {urgency === "warning" && <Badge color="yellow">{dl}d</Badge>}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px" }}><Badge color={statusColor(item.status)}>{item.status}</Badge></td>
                          <td style={{ padding: "12px 16px", textAlign: "center" }}>{item.mandatory ? "✓" : "—"}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => openEdit(item)} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#888" }}><Edit3 size={14} /></button>
                              <button onClick={() => deleteItem(item.id)} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#ccc" }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13 }}>No items found</div>}
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {view === "analytics" && (
          <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {["weekly", "monthly", "yearly"].map(p => (
                <button key={p} onClick={() => setSummaryPeriod(p)} style={{ padding: "8px 18px", borderRadius: 99, border: summaryPeriod === p ? "none" : "1px solid #e0ddd8", background: summaryPeriod === p ? "#1a1a1a" : "white", color: summaryPeriod === p ? "white" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize" }}>{p}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><TrendingUp size={16} color="#2563eb" /> Top 10 Most Expensive</div>
                {analytics.byPrice.map((item, i) => <BarRow key={i} label={item.name} value={item.price} max={analytics.byPrice[0]?.price || 1} color="#2563eb" suffix="€" />)}
              </div>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><BarChart3 size={16} color="#7c3aed" /> Top Categories by Spend</div>
                {analytics.topCats.map((cat, i) => <BarRow key={i} label={cat.name} value={cat.total} max={analytics.topCats[0]?.total || 1} color="#7c3aed" suffix="€" />)}
              </div>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} color="#16a34a" /> Most Consumed</div>
                {analytics.topConsumed.length === 0 ? <div style={{ color: "#aaa", fontSize: 13 }}>No finished items yet</div> : analytics.topConsumed.map((item, i) => <BarRow key={i} label={item.name} value={item.count} max={analytics.topConsumed[0]?.count || 1} color="#16a34a" />)}
              </div>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e8e6e1", padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><XCircle size={16} color="#dc2626" /> Expired / Wasted</div>
                {analytics.expired.length === 0 ? <div style={{ color: "#aaa", fontSize: 13 }}>No expired items!</div> : analytics.expired.map((item, i) => <BarRow key={i} label={item.name} value={item.price} max={Math.max(...analytics.expired.map(e => e.price), 1)} color="#dc2626" suffix="€" />)}
                {analytics.expired.length > 0 && <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", borderRadius: 10, fontSize: 12, color: "#991b1b", fontWeight: 500 }}>Total wasted: €{analytics.wastedSpend.toFixed(2)}</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fade-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowSettings(false)}>
          <div className="anim-in" onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 500, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Settings size={20} /> Connect to Google Sheet</h2>
              <button onClick={() => setShowSettings(false)} style={{ border: "none", background: "transparent", cursor: "pointer" }}><X size={20} color="#999" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#f8f7f4", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Quick setup:</div>
                <ol style={{ fontSize: 12, color: "#666", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  <li>Open your Pantry Manager Google Sheet</li>
                  <li>Go to <strong>Extensions → Apps Script</strong></li>
                  <li>Click <strong>Deploy → New Deployment → Web app</strong></li>
                  <li>Execute as: <strong>Me</strong> · Access: <strong>Anyone</strong></li>
                  <li>Copy the URL and paste below</li>
                </ol>
              </div>
              <FormField label="Apps Script Web App URL">
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)} style={inp} placeholder="https://script.google.com/macros/s/.../exec" />
              </FormField>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { connectApi(urlInput); setShowSettings(false); }} disabled={!urlInput || loading} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: urlInput ? "#1a1a1a" : "#e5e5e5", color: urlInput ? "white" : "#999", fontSize: 14, fontWeight: 600, cursor: urlInput ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {loading ? <><Loader2 size={16} className="spin" /> Connecting...</> : <><Wifi size={16} /> Connect</>}
                </button>
                {connected && (
                  <button onClick={() => { setConnected(false); api.setUrl(null); setItems(SAMPLE_DATA); setShowSettings(false); }} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #e0ddd8", background: "white", fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#dc2626" }}>Disconnect</button>
                )}
              </div>
              {connected && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
                  <Wifi size={14} /> Connected · {items.length} items loaded from Google Sheet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showForm && (
        <div className="fade-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowForm(false)}>
          <div className="anim-in" onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editItem ? "Edit Item" : "Add Item"}</h2>
              <button onClick={() => setShowForm(false)} style={{ border: "none", background: "transparent", cursor: "pointer" }}><X size={20} color="#999" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Item Name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} placeholder="e.g. Whole Milk" /></FormField>
                <FormField label="Price (€)"><input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inp} type="number" step="0.01" placeholder="0.00" /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Category"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></FormField>
                <FormField label="Store"><select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })} style={inp}>{STORES.map(s => <option key={s}>{s}</option>)}</select></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <FormField label="Buy Date"><input value={form.buyDate} onChange={e => setForm({ ...form, buyDate: e.target.value })} style={inp} type="date" /></FormField>
                <FormField label="Expiry Date"><input value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} style={inp} type="date" /></FormField>
                <FormField label="Open Date"><input value={form.openDate} onChange={e => setForm({ ...form, openDate: e.target.value })} style={inp} type="date" /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></FormField>
                <FormField label="Mandatory">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
                    <input type="checkbox" checked={form.mandatory} onChange={e => setForm({ ...form, mandatory: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer" }} />
                    <span style={{ fontSize: 13, color: "#666" }}>Essential item</span>
                  </div>
                </FormField>
              </div>
              <FormField label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, minHeight: 60, resize: "vertical" }} placeholder="Optional notes..." /></FormField>
              <button onClick={saveItem} style={{ padding: "12px 0", borderRadius: 10, border: "none", background: "#1a1a1a", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                {connected && <span style={{ fontSize: 11, opacity: 0.7, marginRight: 6 }}>↑ Syncs to Sheet</span>}
                {editItem ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
