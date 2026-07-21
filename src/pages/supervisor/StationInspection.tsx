import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  CheckCircle2,
  AlertTriangle,
  Camera,
  Plus,
  X,
  Play,
  Mic,
  Square,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { uploadToStorage } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { startRecording, stopRecording, cancelRecording, isRecordingSupported } from "@/lib/audioRecorder";
import { useSpeechToText } from "@/lib/useSpeechToText";
import fb from "@/lib/feedback";
import styles from "./StationInspection.module.css";

interface Media {
  descriptor: any;
  previewUrl: string;
  isVideo: boolean;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function StationInspection() {
  const { t, i18n } = useTranslation();
  const { stationId } = useParams<{ stationId: string }>();
  const history = useHistory();
  const [present] = useIonToast();

  const [result, setResult] = useState<"ok" | "issues">("ok");
  const [notes, setNotes] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  // Revoke any remaining preview object URLs on unmount (avoid blob leaks).
  const mediaRef = useRef(media);
  mediaRef.current = media;
  useEffect(() => () => { mediaRef.current.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl)); }, []);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Voice + live transcription
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<{ descriptor: any; ms: number } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  const stt = useSpeechToText({
    lang: i18n.language?.startsWith("en") ? "en-US" : "es-ES",
    onResult: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text).trim()),
  });

  // Keep the live recording state + stt handle in refs so the unmount cleanup
  // (empty deps) can tear them down without capturing a stale closure.
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const sttRef = useRef(stt);
  sttRef.current = stt;

  // On unmount: clear the tick timer AND — critically — release the microphone
  // and stop speech recognition if a recording is still live. Without this,
  // navigating away mid-recording leaves the mic hot and STT listening.
  useEffect(() => () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (recordingRef.current) {
      try { cancelRecording(); } catch { /* ignore */ }
      try { sttRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  /* --------------------------------------------------------- media */
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      try {
        const descriptor = await uploadToStorage(f, "supervisorInspectionMedia");
        setMedia((m) => [...m, { descriptor, previewUrl: URL.createObjectURL(f), isVideo: f.type.startsWith("video") }]);
      } catch {
        present({ message: t("createTask.uploadError", "No se pudo subir el archivo"), duration: 1500, position: "bottom", color: "danger" });
      }
    }
  };

  /* --------------------------------------------------------- voice */
  const toggleRecord = async () => {
    if (recording) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      setRecording(false);
      try { stt.stop(); } catch { /* ignore */ }
      try {
        const rec = await stopRecording();
        const descriptor = await uploadToStorage(rec.file, "supervisorInspectionAudio");
        setVoice({ descriptor, ms: rec.durationMs });
      } catch {
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
      try { stt.start(); } catch { /* transcription is best-effort */ }
      fb.tap();
      setRecording(true);
      setElapsed(0);
      const started = Date.now();
      tickRef.current = window.setInterval(() => setElapsed(Date.now() - started), 200);
    } catch {
      present({ message: t("createTask.micDenied", "Sin acceso al micrófono"), duration: 1500, position: "bottom", color: "danger" });
    }
  };
  const resetVoice = () => {
    if (recording) { cancelRecording(); try { stt.stop(); } catch { /**/ } if (tickRef.current) window.clearInterval(tickRef.current); setRecording(false); }
    setVoice(null);
    setTranscript("");
    setElapsed(0);
  };

  /* --------------------------------------------------------- submit */
  const canSubmit = !saving && (notes.trim() || media.length || voice || transcript.trim());
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    let coords: any = {};
    try {
      const c = await getCurrentPosition();
      coords = { latitude: c.latitude, longitude: c.longitude };
    } catch { /* location optional */ }
    try {
      await supervisorRoute.createInspection(stationId, {
        result,
        notes: notes.trim() || undefined,
        transcription: transcript.trim() || undefined,
        media: media.map((m) => m.descriptor),
        audio: voice ? [voice.descriptor] : undefined,
        ...coords,
      });
      present({ message: t("inspection.submitted", "Inspección registrada"), duration: 1500, position: "bottom", color: "success" });
      history.goBack();
    } catch {
      present({ message: t("inspection.error", "No se pudo registrar la inspección"), duration: 1600, position: "bottom", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const right = (
    <button type="button" className={styles.headerBtn} disabled={!canSubmit} onClick={submit}>
      {saving ? t("stationDetail.saving", "Guardando…") : t("inspection.finish", "Finalizar")}
    </button>
  );

  return (
    <Screen title={t("inspection.title", "Inspección")} right={right}>
      <p className={styles.subtitle}>{t("inspection.subtitle", "Registra el estado del puesto con evidencia.")}</p>

      {/* Result */}
      <h3 className={styles.sectionTitle}>{t("inspection.result", "Resultado")}</h3>
      <div className={styles.resultRow}>
        <button type="button" onClick={() => { fb.select(); setResult("ok"); }} className={`${styles.resultBtn} ${result === "ok" ? styles.resultOk : ""}`}>
          <CheckCircle2 size={20} />{t("inspection.allClear", "Todo en orden")}
        </button>
        <button type="button" onClick={() => { fb.select(); setResult("issues"); }} className={`${styles.resultBtn} ${result === "issues" ? styles.resultIssues : ""}`}>
          <AlertTriangle size={20} />{t("inspection.issues", "Con novedades")}
        </button>
      </div>

      {/* Notes */}
      <h3 className={styles.sectionTitle}>{t("inspection.notes", "Observaciones")}</h3>
      <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("inspection.notesPh", "Describe lo que observaste…")} />

      {/* Media */}
      <h3 className={styles.sectionTitle}>{t("inspection.evidence", "Evidencia (fotos / video)")}</h3>
      <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" multiple hidden onChange={onPickFiles} />
      <div className={styles.attachRow}>
        {media.map((m, i) => (
          <div key={i} className={styles.thumb}>
            {m.isVideo ? <video src={m.previewUrl} muted /> : <img src={m.previewUrl} alt="" />}
            <button type="button" className={styles.thumbDel} onClick={() => setMedia((arr) => { const rm = arr[i]; if (rm?.previewUrl) URL.revokeObjectURL(rm.previewUrl); return arr.filter((_, j) => j !== i); })}><X size={12} /></button>
            {m.isVideo && <span className={styles.thumbDel} style={{ top: "auto", bottom: 3, right: "auto", left: 3, background: "rgba(0,0,0,.55)" }}><Play size={11} /></span>}
          </div>
        ))}
        <button type="button" className={styles.thumbAdd} onClick={() => fileRef.current?.click()}>
          {media.length ? <Plus size={18} /> : <Camera size={18} />}
          {media.length ? t("createTask.addMore", "Añadir") : t("inspection.capture", "Capturar")}
        </button>
      </div>

      {/* Voice + transcription */}
      <h3 className={styles.sectionTitle}>{t("inspection.voice", "Nota de voz + transcripción")}</h3>
      <div className={styles.voiceCard}>
        <button type="button" className={`${styles.voiceMic} ${recording ? styles.recording : ""}`} onClick={toggleRecord}>
          {recording ? <Square size={20} /> : <Mic size={22} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={styles.voiceTitle}>
            {recording ? t("createTask.recording", "Grabando…") : voice ? t("createTask.voiceReady", "Nota de voz lista") : t("inspection.tapRecord", "Toca para grabar y transcribir")}
          </p>
          <p className={styles.voiceSub}>
            {stt.supported ? t("inspection.transcribes", "Se transcribe automáticamente") : t("inspection.noStt", "Transcripción no disponible en este dispositivo")}
          </p>
        </div>
        <span className={styles.voiceTime}>{fmtTime(recording ? elapsed : voice?.ms || 0)}</span>
        {(voice || recording || transcript) && (
          <button type="button" className="text-muted" onClick={resetVoice}><X size={18} /></button>
        )}
      </div>

      {/* Live / saved transcript */}
      {(transcript || stt.interim || recording) && (
        <div className={`${styles.transcript} ${!transcript && !stt.interim ? styles.transcriptEmpty : ""}`}>
          {transcript}
          {stt.interim ? <span className={styles.interim}>{transcript ? " " : ""}{stt.interim}</span> : null}
          {!transcript && !stt.interim ? t("inspection.listening", "Escuchando…") : null}
        </div>
      )}

      <button type="button" className={styles.submitBtn} disabled={!canSubmit} onClick={submit}>
        {saving ? t("stationDetail.saving", "Guardando…") : t("inspection.submit", "Registrar inspección")}
      </button>
    </Screen>
  );
}
