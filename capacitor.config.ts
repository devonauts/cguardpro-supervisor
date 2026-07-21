import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cguardpro.supervisor",
  appName: "CGuardPro Supervisor",
  webDir: "dist",
  backgroundColor: "#0d0d0d",
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0d0d0d",
    },
    SplashScreen: {
      // We hide it from JS once the app has painted (see src/main.tsx) for a
      // smooth fade with no white flash. But native auto-hide stays ON as a
      // safety net: on a screen-off/Doze launch the JS hide() can no-op and the
      // app would otherwise hang on the logo forever.
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: "#0d0d0d",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
