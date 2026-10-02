package com.cencerro.racing;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Actualización desde la propia app: descarga el APK de la release y abre el instalador del sistema.
// Android siempre pide confirmar la instalación (y, la primera vez, permitir apps de este origen);
// instala encima sin desinstalar mientras el APK nuevo esté firmado con la misma clave.
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    @PluginMethod
    public void version(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("code", PackageInfoCompat.getLongVersionCode(
                getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0)));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // Los métodos de plugin corren fuera del hilo principal: la descarga puede bloquear aquí.
    @PluginMethod
    public void install(PluginCall call) {
        File apk = new File(getContext().getCacheDir(), "update.apk");
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(call.getString("url")).openConnection();
            conn.setInstanceFollowRedirects(true); // GitHub redirige a su CDN (https → https)
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo descargar la actualización: " + e.getMessage());
        }
    }
}
