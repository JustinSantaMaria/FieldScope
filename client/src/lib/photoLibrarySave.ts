export interface SaveToLibraryResult {
  success: boolean;
  method: "native" | "unsupported";
  error?: string;
}

/**
 * Detects if the app is running inside a native wrapper (Capacitor, React Native, Cordova).
 * Returns true ONLY for native apps, not for web browsers or PWAs.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  
  const w = window as any;
  
  // Capacitor detection
  if (w.Capacitor?.isNativePlatform?.()) return true;
  
  // Cordova detection
  if (w.cordova) return true;
  
  // React Native WebView detection
  if (w.ReactNativeWebView) return true;
  
  return false;
}

/**
 * Saves a photo to the device's photo library.
 * Only works in native apps (Capacitor/React Native/Cordova).
 * On web browsers, this is a no-op and returns unsupported.
 */
export async function saveToPhotoLibrary(file: File): Promise<SaveToLibraryResult> {
  if (!isNativeApp()) {
    console.log("[photoLibrarySave] Not in native app - save to photos not available");
    return {
      success: false,
      method: "unsupported",
      error: "Save to Photos is only available in the FieldScope mobile app",
    };
  }
  
  return await saveViaNativeAPI(file);
}

async function saveViaNativeAPI(file: File): Promise<SaveToLibraryResult> {
  try {
    const w = window as any;
    
    // Capacitor with Filesystem + Media plugins
    if (w.Capacitor?.Plugins?.Filesystem && w.Capacitor?.Plugins?.Media) {
      const base64 = await fileToBase64(file);
      const fileName = `fieldscope_${Date.now()}.jpg`;
      
      await w.Capacitor.Plugins.Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: 'CACHE',
      });
      
      const cacheUri = await w.Capacitor.Plugins.Filesystem.getUri({
        path: fileName,
        directory: 'CACHE',
      });
      
      await w.Capacitor.Plugins.Media.savePhoto({
        path: cacheUri.uri,
      });
      
      return { success: true, method: "native" };
    }
    
    // Cordova photo library plugin
    if (w.cordova?.plugins?.photoLibrary) {
      return new Promise((resolve) => {
        w.cordova.plugins.photoLibrary.saveImage(
          file,
          'FieldScope',
          () => resolve({ success: true, method: "native" }),
          (err: any) => resolve({ 
            success: false, 
            method: "native", 
            error: err?.message || "Failed to save" 
          })
        );
      });
    }
    
    // Native wrapper detected but required plugins not installed
    console.log("[photoLibrarySave] Native save-to-photos not available (native wrapper/plugins not installed)");
    return {
      success: false,
      method: "unsupported",
      error: "Native photo library plugins not installed",
    };
  } catch (err: any) {
    console.error("[photoLibrarySave] Native API error:", err);
    return {
      success: false,
      method: "native",
      error: err.message || "Native save failed",
    };
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PREF_KEY = "fieldscope_save_photos_to_library";

export function getSaveToLibraryPreference(): boolean {
  if (typeof localStorage === "undefined") return true;
  const stored = localStorage.getItem(PREF_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function setSaveToLibraryPreference(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREF_KEY, value ? "true" : "false");
}
