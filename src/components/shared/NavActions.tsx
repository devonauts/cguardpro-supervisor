import { useHistory } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleUserRound } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import fb from "@/lib/feedback";

/**
 * Standard trailing nav-bar items shared across the app's primary screens: the
 * notification bell + the profile button, both rendered as matching round icon
 * buttons with even spacing. Tapping the profile opens the Profile screen.
 */
export function NavActions() {
  const history = useHistory();
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      {/* Cancel NotificationBell's edge-hugging offsets so it aligns + spaces evenly. */}
      <span className="-mt-0.5 mr-1.5 inline-flex">
        <NotificationBell />
      </span>
      <button
        type="button"
        aria-label={t("nav.profile", "Perfil")}
        onClick={() => { fb.tap(); history.push("/supervisor/profile"); }}
        className="pressable shrink-0 rounded-full p-2 text-ink active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
      >
        <CircleUserRound size={27} />
      </button>
    </div>
  );
}

export default NavActions;
