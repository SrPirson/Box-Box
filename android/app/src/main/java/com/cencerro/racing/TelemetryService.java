package com.cencerro.racing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

// Servicio en primer plano mientras este móvil conduce: con la pantalla apagada o la app en segundo plano,
// Android no la duerme ni la cierra ni le corta la red, y el wake lock parcial mantiene la CPU despierta.
// El trabajo (GPS y telemetría) lo hacen BackgroundPlugin y el JavaScript; este servicio solo los mantiene vivos.
public class TelemetryService extends Service {
    private static final String CHANNEL = "telemetria";
    private static final int ID = 1;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Telemetría en curso", NotificationManager.IMPORTANCE_LOW));
        }
        // Tocar la notificación vuelve a la app.
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Box Box · enviando telemetría")
            .setContentText("GPS y OBD activos aunque apagues la pantalla")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(open)
            .build();
        ServiceCompat.startForeground(this, ID, n,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "boxbox:telemetria");
            wakeLock.acquire(12 * 60 * 60 * 1000L); // tope de 12 h por si la app muere sin pararlo
        }
        return START_NOT_STICKY; // si Android lo mata, no se relanza solo sin la app
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
