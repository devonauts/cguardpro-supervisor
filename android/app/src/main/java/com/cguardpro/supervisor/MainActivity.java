package com.cguardpro.supervisor;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enforceMinWebView();
    }

    /**
     * The web bundle (Tailwind v4 + layered Ionic CSS) requires a modern
     * WebView: below Chromium 99 every @layer block is discarded and the app
     * renders a PERMANENT BLACK SCREEN after the splash; 99-110 renders with
     * broken color-mix() declarations. Floor = 111 (Tailwind v4's own browser
     * baseline). Devices without Play-updated WebView (AOSP, enterprise,
     * emulators) would otherwise fail silently.
     */
    private static final int MIN_WEBVIEW_MAJOR = 111;

    private void enforceMinWebView() {
        try {
            PackageInfo wv = WebViewCompat.getCurrentWebViewPackage(this);
            if (wv == null || wv.versionName == null) return; // unknown → don't false-block
            int major = 0;
            try { major = Integer.parseInt(wv.versionName.split("\\.")[0]); } catch (Exception ignored) {}
            if (major > 0 && major < MIN_WEBVIEW_MAJOR) {
                final String pkg = wv.packageName;
                new AlertDialog.Builder(this)
                    .setTitle("Actualización requerida")
                    .setMessage("CGuardPro necesita Android System WebView " + MIN_WEBVIEW_MAJOR
                        + " o superior (instalado: " + wv.versionName
                        + "). Actualízalo desde Play Store y vuelve a abrir la app.")
                    .setCancelable(false)
                    .setPositiveButton("Actualizar", (d, w) -> {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
                        } catch (Exception e) {
                            startActivity(new Intent(Intent.ACTION_VIEW,
                                Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
                        }
                    })
                    .show();
            }
        } catch (Exception ignored) { /* never block launch on the guard itself */ }
    }
}
