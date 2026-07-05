import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  ShieldAlert,
  MinusCircle,
  CalendarDays,
  RefreshCw,
  Paperclip,
  Plus,
  X,
  Play,
  Mic,
  Trash2,
  Info,
  Building2,
  ChevronDown,
  User as UserIcon,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { uploadToStorage } from "@/lib/services";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { startRecording, stopRecording, cancelRecording, isRecordingSupported } from "@/lib/audioRecorder";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./CreateTask.module.css";

type Prio = "alta" | "media" | "baja";

interface Attachment {
  descriptor: any;
  previewUrl: string;
  isVideo: boolean;
}

const PRIOS: { value: Prio; key: string; def: string; color: string }[] = [
  { value: "alta", key: "stationDetail.prio_alta", def: "Alta", color: "#ef4444" },
  { value: "media", key: "stationDetail.prio_media", def: "Media", color: "#f59e0b" },
  { value: "baja", key: "stationDetail.prio_baja", def: "Baja", color: "#3b82f6" },
];

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function CreateTask() {
  const { t } = useTranslation();
  const { stationId } = useParams<{ stationId: string }>();
  const history = useHistory();
  const [present] = useIonToast();

  const { data: station } = useAsync(
    async () => supervisorRoute.stationDetail(stationId).then((r: any) => r?.station ?? r),
    [stationId],
  );
  const guards: any[] = Array.isArray(station?.guards) ? station.guards : [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [guard, setGuard] = useState<any | null>(null);
  const [priority, setPriority] = useState<Prio>("media");
  const [due, setDue] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [guardPickerOpen, setGuardPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<{ descriptor: any; ms: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); }, []);

  const stationLabel = station?.name || t("stations.title", "Estación");

  /* ------------------------------------------------------- attachments */
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      try {
        const descriptor = await uploadToStorage(f, "supervisorTaskAttachment");
        setAttachments((a) => [...a, { descriptor, previewUrl: URL.createObjectURL(f), isVideo: f.type.startsWith("video") }]);
      } catch {
        present({ message: t("createTask.uploadError", "No se pudo subir el archivo"), duration: 1500, position: "bottom", color: "danger" });
      }
    }
  };

  /* ------------------------------------------------------------ voice */
  const toggleRecord = async () => {
    if (recording) {
      try {
        const rec = await stopRecording();
        if (tickRef.current) window.clearInterval(tickRef.current);
        setRecording(false);
        const descriptor = await uploadToStorage(rec.file, "supervisorTaskVoiceNote");
        setVoice({ descriptor, ms: rec.durationMs });
      } catch {
        setRecording(false);
        present({ message: t("createTask.voiceError", "No se pudo grabar"), duration: 1500, position: "bottom", color: "danger" });
      }
      return;
    }
    if (!isRecordingSupported()) {
      present({ message: t("createTask.voiceUnsupported", "Grabación no disponible"), duration: 1500, position: "bottom" });
      return;
    }
    try {
      await startRecording();
      fb.tap();
      setRecording(true);
      setElapsed(0);
      const started = Date.now();
      tickRef.current = window.setInterval(() => setElapsed(Date.now() - started), 200);
    } catch {
      present({ message: t("createTask.micDenied", "Sin acceso al micrófono"), duration: 1500, position: "bottom", color: "danger" });
    }
  };
  const deleteVoice = () => {
    if (recording) { cancelRecording(); if (tickRef.current) window.clearInterval(tickRef.current); setRecording(false); }
    setVoice(null);
    setElapsed(0);
  };

  /* ----------------------------------------------------------- submit */
  const canCreate = title.trim().length > 0 && !saving;
  const create = async () => {
    if (!canCreate) return;
    setSaving(true);
    try {
      await supervisorRoute.createStationTask(stationId, {
        taskToDo: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: due ? new Date(due).toISOString() : undefined,
        assignedGuardId: guard?.id || undefined,
        repeatConfig: repeat !== "none" ? { rule: repeat } : undefined,
        attachments: attachments.map((a) => a.descriptor),
        voiceNote: voice ? [voice.descriptor] : undefined,
      } as any);
      present({ message: t("stationDetail.taskCreated", "Tarea creada"), duration: 1400, position: "bottom", color: "success" });
      history.goBack();
    } catch {
      present({ message: t("stationDetail.taskError", "No se pudo crear la tarea"), duration: 1600, position: "bottom", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const right = (
    <div className="flex items-center gap-4">
      <button type="button" className={`${styles.headerBtn} ${styles.headerDraft}`} onClick={() => history.goBack()}>
        {t("createTask.saveDraft", "Descartar")}
      </button>
      <button type="button" className={`${styles.headerBtn} ${styles.headerCreate}`} disabled={!canCreate} onClick={create} style={!canCreate ? { opacity: 0.5 } : undefined}>
        {saving ? t("stationDetail.saving", "Guardando…") : t("createTask.create", "Crear")}
      </button>
    </div>
  );

  return (
    <Screen title={t("createTask.title", "Crear tarea")} right={right}>
      <p className={styles.subtitle}>{t("createTask.subtitle", "Crea una tarea y asígnala a tu equipo.")}</p>

      {/* Task details */}
      <h3 className={styles.sectionTitle}>{t("createTask.details", "Detalles de la tarea")}</h3>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("createTask.taskTitle", "Título")} <span className={styles.req}>*</span></label>
        <input className={styles.input} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t("createTask.titlePh", "Ej.: Revisar puertas del perímetro")} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("createTask.description", "Descripción")}</label>
        <textarea className={styles.textarea} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder={t("createTask.descPh", "Agrega detalles, instrucciones o información adicional…")} />
        <span className={styles.counter}>{description.length}/500</span>
      </div>

      {/* Assign */}
      <h3 className={styles.sectionTitle}>{t("createTask.assign", "Asignar")}</h3>
      <div className={styles.assignRow}>
        <button type="button" className={styles.assignCard} onClick={() => { fb.tap(); setGuardPickerOpen(true); }}>
          {guard?.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={guard.avatarUrl} className={styles.assignAvatar} />
          ) : (
            <span className={`${styles.assignAvatar} ${styles.assignAvatarPh}`}><UserIcon size={18} /></span>
          )}
          <div className={styles.assignBody}>
            <p className={styles.assignValue}>{guard?.name || t("createTask.anyGuard", "Cualquiera")}</p>
            <p className={styles.assignSub}>{t("guards.role", "Oficial de Seguridad")}</p>
          </div>
          <ChevronDown size={18} className="shrink-0 text-muted" />
        </button>
        <div className={styles.assignCard}>
          <span className={`${styles.assignAvatar} ${styles.assignAvatarPh}`} style={{ borderRadius: 10 }}><Building2 size={18} /></span>
          <div className={styles.assignBody}>
            <p className={styles.assignValue}>{stationLabel}</p>
            <p className={styles.assignSub}>{t("stations.title", "Estación")}</p>
          </div>
        </div>
      </div>

      {/* Priority + Due date */}
      <h3 className={styles.sectionTitle}>{t("stationDetail.priority", "Prioridad")} <span className={styles.req}>*</span></h3>
      <div className={styles.prioRow}>
        {PRIOS.map((p) => {
          const active = priority === p.value;
          return (
            <button key={p.value} type="button" onClick={() => { fb.select(); setPriority(p.value); }} className={styles.prioBtn}
              style={active ? { borderColor: p.color, color: p.color } : undefined}>
              <ShieldAlert size={22} style={{ color: p.color }} />
              {t(p.key, p.def)}
            </button>
          );
        })}
      </div>

      <h3 className={styles.sectionTitle}>{t("createTask.dueDate", "Fecha y hora")} <span className={styles.req}>*</span></h3>
      <div className={styles.rowCard}>
        <CalendarDays size={20} className={styles.rowIcon} />
        <input type="datetime-local" className={styles.rowInput} value={due} onChange={(e) => setDue(e.target.value)} />
      </div>

      {/* Repeat */}
      <h3 className={styles.sectionTitle}>{t("createTask.repeat", "Repetir")}</h3>
      <div className={styles.rowCard}>
        <RefreshCw size={20} className={styles.rowIcon} />
        <select className={styles.rowInput} value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          <option value="none">{t("createTask.repeatNone", "No se repite")}</option>
          <option value="daily">{t("createTask.repeatDaily", "Diariamente")}</option>
          <option value="weekly">{t("createTask.repeatWeekly", "Semanalmente")}</option>
          <option value="monthly">{t("createTask.repeatMonthly", "Mensualmente")}</option>
        </select>
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </div>

      {/* Attachments */}
      <h3 className={styles.sectionTitle}>{t("createTask.attachments", "Adjuntos")}</h3>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
      <div className={styles.attachRow}>
        <button type="button" className={styles.dropzone} onClick={() => fileRef.current?.click()}>
          <Paperclip size={20} />
          <div>
            <p className={styles.dropTitle}>{t("createTask.attachCta", "Adjuntar fotos o videos")}</p>
            <p className={styles.dropSub}>{t("createTask.attachMax", "Tamaño máx. 20MB")}</p>
          </div>
        </button>
        {attachments.map((a, i) => (
          <div key={i} className={styles.thumb}>
            {a.isVideo ? <video src={a.previewUrl} muted /> : <img src={a.previewUrl} alt="" />}
            <button type="button" className={styles.thumbDel} onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}><X size={12} /></button>
            {a.isVideo && <span className={styles.thumbDel} style={{ top: "auto", bottom: 3, right: "auto", left: 3, background: "rgba(0,0,0,.55)" }}><Play size={11} /></span>}
          </div>
        ))}
        <button type="button" className={styles.thumbAdd} onClick={() => fileRef.current?.click()}>
          <Plus size={18} />{t("createTask.addMore", "Añadir")}
        </button>
      </div>

      {/* Voice instructions */}
      <h3 className={styles.sectionTitle}>{t("createTask.voice", "Instrucciones de voz")}</h3>
      <div className={styles.voiceCard}>
        <button type="button" className={`${styles.voiceMic} ${recording ? styles.recording : ""}`} onClick={toggleRecord}>
          <Mic size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={styles.voiceTitle}>
            {recording ? t("createTask.recording", "Grabando…") : voice ? t("createTask.voiceReady", "Nota de voz lista") : t("createTask.voiceCta", "Toca para grabar")}
          </p>
          <p className={styles.voiceSub}>{t("createTask.voiceHint", "Se compartirá con el vigilante asignado")}</p>
        </div>
        <span className={styles.voiceTime}>{fmtTime(recording ? elapsed : voice?.ms || 0)} / 2:00</span>
        {(voice || recording) && (
          <button type="button" className={styles.voiceDel} onClick={deleteVoice}><Trash2 size={18} /></button>
        )}
      </div>

      {/* Info banner */}
      <div className={styles.infoBanner}>
        <Info size={18} className="shrink-0 text-gold" />
        {t("createTask.notifyInfo", "El vigilante asignado recibirá una notificación de esta tarea.")}
      </div>

      {/* Guard picker */}
      <Sheet open={guardPickerOpen} onClose={() => setGuardPickerOpen(false)} title={t("createTask.pickGuard", "Asignar vigilante")}>
        <div className="flex flex-col gap-1 pb-2">
          <button type="button" className="flex items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-surface-2" onClick={() => { setGuard(null); setGuardPickerOpen(false); }}>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-muted"><UserIcon size={18} /></span>
            <span className="text-[15px] font-semibold text-ink">{t("createTask.anyGuard", "Cualquiera del puesto")}</span>
          </button>
          {guards.map((g) => (
            <button key={g.id} type="button" className="flex items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-surface-2" onClick={() => { setGuard({ id: g.id, name: g.name, avatarUrl: fileUrlFromFile(g.avatar) || g.avatarUrl || null }); setGuardPickerOpen(false); }}>
              {g.avatarUrl || g.avatar ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={g.avatarUrl || fileUrlFromFile(g.avatar) || ""} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">{(g.name || "?").slice(0, 1)}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{g.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}
