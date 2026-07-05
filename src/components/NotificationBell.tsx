import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import fb from "@/lib/feedback";

/**
 * Header bell — drops into the `right` slot of <Screen />. Mirrors the app's
 * header icon-button style (rounded, `pressable`, active tint) and overlays an
 * unread count pill driven by the notification context. Tapping opens the
 * <NotificationCenter /> sheet; open state is owned here.
 */
export default function NotificationBell() {
  const { t } = useTranslation();
  const history = useHistory();
  const { unreadCount } = useNotifications();

  return (
    <button
      type="button"
      aria-label={t("aria.notifications", "Notificaciones")}
      onClick={() => {
        fb.tap();
        history.push("/supervisor/notifications");
      }}
      className="pressable relative -mr-1.5 mt-0.5 shrink-0 rounded-full p-2 text-ink active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
    >
      <Bell size={27} />
      {unreadCount > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-critical px-1 text-xs font-bold leading-[18px] text-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
