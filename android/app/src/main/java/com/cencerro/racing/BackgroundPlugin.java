package com.cencerro.racing;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Telemetría con la pantalla apagada: arranca el servicio en primer plano y, mientras dura,
//  - "location": cada posición del GPS nativo (el GPS del WebView se para en segundo plano);
//  - "tick": un pulso periódico que despierta las esperas del bucle de telemetría en JavaScript
//    (con la página oculta, el WebView ralentiza los setTimeout hasta casi pararlos).
@CapacitorPlugin(name = "Background")
public class BackgroundPlugin extends Plugin {
    private static final long TICK_MS = 250;
    private final Handler main = new Handler(Looper.getMainLooper());
    private LocationManager lm;
    private boolean running;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            notifyListeners("tick", new JSObject());
            main.postDelayed(this, TICK_MS);
        }
    };

    private final LocationListener onFix = new LocationListener() {
        @Override
        public void onLocationChanged(Location l) {
            JSObject p = new JSObject();
            p.put("lat", l.getLatitude());
            p.put("lng", l.getLongitude());
            p.put("acc", Math.round(l.getAccuracy()));
            if (l.hasSpeed()) p.put("speed", Math.round(l.getSpeed() * 3.6));
            if (l.hasBearing() && l.hasSpeed() && l.getSpeed() > 1) p.put("heading", Math.round(l.getBearing()));
            notifyListeners("location", p);
        }
        // Necesarios en Android < 11, donde no tienen implementación por defecto.
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}
    };

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Falta el permiso de ubicación");
            return;
        }
        ContextCompat.startForegroundService(ctx, new Intent(ctx, TelemetryService.class));
        if (!running) {
            running = true;
            lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            try {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500, 0, onFix, Looper.getMainLooper());
            } catch (SecurityException e) {
                running = false;
                call.reject("Falta el permiso de ubicación");
                return;
            }
            main.post(tick);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        halt();
        call.resolve();
    }

    private void halt() {
        running = false;
        main.removeCallbacks(tick);
        if (lm != null) lm.removeUpdates(onFix);
        getContext().stopService(new Intent(getContext(), TelemetryService.class));
    }

    @Override
    protected void handleOnDestroy() {
        halt(); // la app se cierra del todo: fuera notificación y wake lock
    }
}
