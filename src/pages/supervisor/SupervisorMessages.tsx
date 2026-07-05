import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { IonModal, IonContent, useIonActionSheet } from "@ionic/react";
import {
  Search, Users, MessageSquare, Megaphone, ShieldAlert,
  Building2, ChevronRight, Archive, BellOff, UserRound, Plus, X, Loader2, SendHorizontal,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import { ErrorState, SkeletonList } from "@/components/ui";
import { staffMessageService } from "@/lib/services";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./SupervisorMessages.module.css";

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

type Cat = "all" | "operations" | "guards" | "customers" | "broadcasts";
type Chip = "all" | "unread" | "favorites";

function nameOf(c: any): string {
  return c.recipientName || c.counterpartName || c.subject || c.title || "—";
}
function categoryOf(c: any): Exclude<Cat, "all"> {
  const n = nameOf(c).toLowerCase();
  if (c.isOneWay || c.kind === "broadcast" || /broadcast|difus/i.test(n)) return "broadcasts";
  if (c.recipientType === "client" || c.isCustomer) return "customers";
  if (c.isGroup || c.kind === "group") return "operations";
  return "guards";
}
function isEmergency(c: any): boolean {
  return /emergenc|sos|pánico|panic/i.test(nameOf(c));
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (same(d, y)) return "Ayer";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Avatar: photo → category icon with a tinted circle. */
function ConvAvatar({ c }: { c: any }) {
  const photo = useFileUrl(c.avatarUrl || c.avatar || c.photo || null);
  const cat = categoryOf(c);
  const emergency = isEmergency(c);
  const meta = emergency
    ? { bg: "#ef4444", fg: "#fff", icon: <ShieldAlert size={22} /> }
    : cat === "broadcasts" ? { bg: "#22c55e22", fg: "#22c55e", icon: <Megaphone size={20} /> }
    : cat === "operations" ? { bg: "#3b82f622", fg: "#3b82f6", icon: <Users size={20} /> }
    : cat === "customers" ? { bg: "var(--surface-2)", fg: "var(--muted)", icon: <Building2 size={20} /> }
    : { bg: "var(--surface-2)", fg: "var(--muted)", icon: <UserRound size={20} /> };
  return (
    <span className={styles.avatarWrap}>
      <span className={styles.avatar} style={{ background: meta.bg, color: meta.fg }}>
        {photo ? <img src={photo} alt="" /> : meta.icon}
      </span>
      {c.online && <span className={styles.dot} />}
    </span>
  );
}

function ConvRow({ c, onOpen, onLongPress }: { c: any; onOpen: () => void; onLongPress: () => void }) {
  const preview = c.lastMessagePreview || (c.isGroup ? "Grupo" : "");
  const [sender, ...rest] = String(preview).split(/:\s(.+)/);
  const hasSender = rest.length > 0;
  const timer = useRef<any>(null);
  const longFired = useRef(false);
  const start = () => { longFired.current = false; timer.current = setTimeout(() => { longFired.current = true; fb.press(); onLongPress(); }, 500); };
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return (
    <button
      type="button"
      onClick={() => { if (longFired.current) { longFired.current = false; return; } onOpen(); }}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerMove={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      className={styles.row}
    >
      <ConvAvatar c={c} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate ${styles.name}`}>{nameOf(c)}</span>
          <span className={styles.time}>{fmtTime(c.lastMessageAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className={`min-w-0 flex-1 truncate ${styles.preview}`}>
            {hasSender ? (<><span className={styles.previewSender} style={{ color: "var(--online)" }}>{sender}: </span>{rest[0]}</>) : preview}
          </span>
          {c.muted && <BellOff size={14} className="shrink-0 text-faint" />}
          {(c.unreadCount || 0) > 0 && <span className={styles.badge}>{c.unreadCount}</span>}
        </span>
      </span>
    </button>
  );
}

export default function SupervisorMessages() {
  const { t } = useTranslation();
  const history = useHistory();
  const [cat, setCat] = useState<Cat>("all");
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");

  const [composing, setComposing] = useState(false);
  const [presentActionSheet] = useIonActionSheet();
  const { data, loading, error, reload } = useAsync<any>(() => staffMessageService.listThreads({ limit: 100 }), []);

  const confirmDelete = (c: any) => {
    presentActionSheet({
      header: nameOf(c),
      subHeader: t("messages.deleteHint", "Se eliminará solo para ti."),
      buttons: [
        { text: t("messages.deleteChat", "Eliminar conversación"), role: "destructive", handler: () => { staffMessageService.remove(String(c.id)).then(reload).catch(() => {}); } },
        { text: t("app.cancel", "Cancelar"), role: "cancel" },
      ],
    });
  };
  const rows: any[] = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];

  const counts = useMemo(() => {
    const c = { all: rows.length, operations: 0, guards: 0, customers: 0, broadcasts: 0 };
    rows.forEach((r) => { c[categoryOf(r)]++; });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    let list = cat === "all" ? rows : rows.filter((r) => categoryOf(r) === cat);
    if (chip === "unread") list = list.filter((r) => (r.unreadCount || 0) > 0);
    if (chip === "favorites") list = list.filter((r) => r.isFavorite || r.pinned);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) => `${nameOf(r)} ${r.lastMessagePreview || ""}`.toLowerCase().includes(s));
    }
    return list;
  }, [rows, cat, chip, q]);

  const TABS: [Cat, string, number, string][] = [
    ["all", t("messages.all", "Todas"), counts.all, "#d4a017"],
    ["operations", t("messages.operations", "Operaciones"), counts.operations, "var(--surface-2)"],
    ["guards", t("guards.title", "Vigilantes"), counts.guards, "var(--surface-2)"],
    ["customers", t("messages.customers", "Clientes"), counts.customers, "var(--surface-2)"],
    ["broadcasts", t("messages.broadcasts", "Difusión"), counts.broadcasts, "var(--surface-2)"],
  ];

  return (
    <Screen largeTitle={t("messages.title", "Mensajes")} largeSubtitle={t("messages.subtitle", "Todas las conversaciones")} right={<NavActions />} onMenu={openAppMenu} root flush onRefresh={reload}>
      {/* Category tabs */}
      <div className={styles.tabs}>
        {TABS.map(([key, label, count, color]) => (
          <button key={key} type="button" onClick={() => { fb.select(); setCat(key); }} className={`${styles.tab} ${cat === key ? styles.tabActive : ""}`}>
            {label}
            <span className={styles.tabCount} style={{ background: cat === key ? color : "var(--surface-2)", color: cat === key ? (key === "all" ? "#fff" : "var(--ink)") : "var(--muted)" }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Search + filter chips */}
      <div className="px-4 pt-4">
        <label className={styles.search}>
          <Search size={18} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("messages.searchConversations", "Buscar conversaciones")} />
        </label>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {([["all", t("visitors.all", "Todas")], ["unread", t("messages.unread", "No leídas")], ["favorites", t("messages.favorites", "Favoritas")]] as [Chip, string][]).map(([key, label]) => (
            <button key={key} type="button" onClick={() => { fb.select(); setChip(key); }} className={`${styles.chip} ${chip === key ? styles.chipActive : ""}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="px-4 pt-4"><SkeletonList rows={7} /></div>
      ) : error && rows.length === 0 ? (
        <div className="px-4 pt-8"><ErrorState onRetry={reload} /></div>
      ) : (
        <div className="mt-3 pb-24">
          {shown.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-center">
              <MessageSquare size={30} className="text-faint" />
              <p className="text-sm text-muted">{t("messages.empty", "Sin conversaciones")}</p>
            </div>
          ) : (
            shown.map((c) => <ConvRow key={c.id} c={c} onOpen={() => { fb.tap(); history.push(`/supervisor/messages/${c.id}`); }} onLongPress={() => confirmDelete(c)} />)
          )}

          <button type="button" onClick={() => fb.tap()} className={styles.archived}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><Archive size={18} /></span>
            <span className="flex-1 text-[15px] font-semibold text-ink">{t("messages.archived", "Archivadas")}</span>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </div>
      )}

      {/* New conversation (FAB) — bottom-left, clear of the floating SOS/Radio cluster. */}
      <button
        type="button"
        aria-label={t("messages.new", "Nueva conversación")}
        onClick={() => { fb.press(); setComposing(true); }}
        className="pressable fixed bottom-24 left-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-gold text-on-accent shadow-lg shadow-black/30"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus size={26} />
      </button>

      <ComposeSheet
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={(id) => { setComposing(false); reload(); history.push(`/supervisor/messages/${id}`); }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------- compose sheet */

function ComposeSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (conversationId: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data } = useAsync<any>(() => (open ? supervisorRoute.guards() : Promise.resolve(null)), [open]);
  const guards: any[] = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.guards) ? data.guards : Array.isArray(data) ? data : [];
  const shown = q.trim() ? guards.filter((g) => String(g.name || "").toLowerCase().includes(q.toLowerCase())) : guards;

  const reset = () => { setQ(""); setRecipient(null); setBody(""); setErr(null); };

  const create = async () => {
    if (!recipient || !body.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const res: any = await staffMessageService.create("guard", recipient.id, body.trim(), newId());
      const id = res?.conversation?.id || res?.conversationId;
      fb.press();
      reset();
      if (id) onCreated(String(id));
      else onClose();
    } catch (e: any) {
      fb.error();
      setErr(e?.message || t("messages.sendFailed", "No se pudo crear la conversación."));
    } finally { setBusy(false); }
  };

  return (
    <IonModal isOpen={open} onDidDismiss={() => { reset(); onClose(); }} breakpoints={[0, 0.92]} initialBreakpoint={0.92} handle className={styles.composeSheet}>
      <IonContent>
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <button type="button" aria-label={t("app.close", "Cerrar")} onClick={() => { reset(); onClose(); }} className="grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><X size={22} /></button>
          <p className="flex-1 text-[17px] font-extrabold text-ink">{t("messages.newConversation", "Nueva conversación")}</p>
        </div>

        {recipient ? (
          <div className="px-4 pb-10">
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-muted"><UserRound size={22} /></span>
              <span className="flex-1 truncate text-[15.5px] font-semibold text-ink">{recipient.name}</span>
              <button type="button" onClick={() => setRecipient(null)} className="text-[13px] font-semibold text-gold">{t("messages.change", "Cambiar")}</button>
            </div>

            {err && <p className="mt-3 text-[12px] text-critical">{err}</p>}
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("messages.firstMessage", "Escribe el primer mensaje…")}
              rows={5}
              className="mt-3 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-[15px] text-ink placeholder:text-faint focus:border-gold focus:outline-none"
            />

            <button type="button" disabled={!body.trim() || busy} onClick={create} className="mt-5 flex min-h-[3.5rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-gold px-6 py-4 text-[16px] font-bold text-on-accent disabled:opacity-50">
              {busy ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
              {t("messages.startChat", "Iniciar conversación")}
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3">
              <label className={styles.search}>
                <Search size={18} className="text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("messages.searchGuard", "Buscar vigilante")} />
              </label>
            </div>
            <div className="space-y-2.5 px-4 pb-8 pt-4">
              {shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">{t("guards.empty", "Sin vigilantes")}</p>
              ) : (
                shown.map((g) => (
                  <button key={g.id} type="button" onClick={() => { fb.tap(); setRecipient({ id: String(g.id), name: g.name || "—" }); }} className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-left active:opacity-80">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-muted"><UserRound size={22} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px] font-semibold text-ink">{g.name}</span>
                      {g.stationName && <span className="mt-0.5 block truncate text-[13px] text-muted">{g.stationName}</span>}
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-faint" />
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </IonContent>
    </IonModal>
  );
}
