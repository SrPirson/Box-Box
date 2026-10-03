package com.cencerro.racing;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThermalPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(BackgroundPlugin.class);
        registerPlugin(ClassicBtPlugin.class);
        super.onCreate(savedInstanceState);
        // El móvil va en el salpicadero: pantalla siempre encendida con la app abierta.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        askPermissions();
    }

    // Todo lo que la app necesita, pedido al abrirla para que el piloto lo acepte antes de salir a pista:
    // ubicación (GPS del coche), desde Android 12 Bluetooth (adaptador OBD) y desde Android 13 notificaciones
    // (la del servicio que mantiene la telemetría con la pantalla apagada).
    private void askPermissions() {
        List<String> wanted = new ArrayList<>();
        wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
        wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            wanted.add(Manifest.permission.BLUETOOTH_SCAN);
            wanted.add(Manifest.permission.BLUETOOTH_CONNECT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) wanted.add(Manifest.permission.POST_NOTIFICATIONS);
        List<String> missing = new ArrayList<>();
        for (String p : wanted) if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (!missing.isEmpty()) ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 1);
    }
}
