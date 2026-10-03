package com.cencerro.racing;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

// Adaptadores ELM327 de Bluetooth clásico (los que se emparejan con PIN 1234): puerto serie SPP por RFCOMM.
// El adaptador se empareja antes en los ajustes de Bluetooth de Android; aquí solo se listan los emparejados.
//  - "data": lo que llega del adaptador, como texto;
//  - "disconnected": la conexión se ha caído (contacto quitado, fuera de alcance).
@SuppressLint("MissingPermission") // se comprueba en allowed()
@CapacitorPlugin(name = "ClassicBt")
public class ClassicBtPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket socket;
    private OutputStream out;

    private BluetoothAdapter adapter(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Falta el permiso de Bluetooth: Ajustes → Permisos → Dispositivos cercanos");
            return null;
        }
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter a = bm == null ? null : bm.getAdapter();
        if (a == null) { call.reject("Este móvil no tiene Bluetooth"); return null; }
        if (!a.isEnabled()) { call.reject("Activa el Bluetooth del móvil"); return null; }
        return a;
    }

    @PluginMethod
    public void paired(PluginCall call) {
        BluetoothAdapter a = adapter(call);
        if (a == null) return;
        JSArray list = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            JSObject o = new JSObject();
            o.put("name", d.getName());
            o.put("address", d.getAddress());
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("devices", list);
        call.resolve(ret);
    }

    // Los métodos de plugin corren fuera del hilo principal: connect() puede bloquear unos segundos.
    @PluginMethod
    public void connect(PluginCall call) {
        BluetoothAdapter a = adapter(call);
        if (a == null) return;
        String address = call.getString("address");
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) { call.reject("Elige el adaptador en Ajustes"); return; }
        close();
        a.cancelDiscovery(); // la búsqueda de dispositivos ralentiza y hace fallar la conexión
        BluetoothDevice d = a.getRemoteDevice(address);
        BluetoothSocket s = null;
        try {
            s = open(d);
        } catch (IOException e) {
            call.reject("No se pudo conectar con el adaptador: ¿está encendido el contacto y emparejado?");
            return;
        }
        try {
            socket = s;
            out = s.getOutputStream();
            read(s, s.getInputStream());
            call.resolve();
        } catch (IOException e) {
            close();
            call.reject(e.getMessage());
        }
    }

    // Seguro, después sin cifrar y, como último recurso, el canal 1 directo: cada clon acepta una distinta.
    private BluetoothSocket open(BluetoothDevice d) throws IOException {
        IOException last = null;
        for (int i = 0; i < 3; i++) {
            BluetoothSocket s = null;
            try {
                s = i == 0 ? d.createRfcommSocketToServiceRecord(SPP)
                    : i == 1 ? d.createInsecureRfcommSocketToServiceRecord(SPP)
                    : (BluetoothSocket) d.getClass().getMethod("createRfcommSocket", int.class).invoke(d, 1);
                s.connect();
                return s;
            } catch (IOException e) {
                last = e;
            } catch (Exception e) {
                last = new IOException(e);
            }
            if (s != null) try { s.close(); } catch (IOException ignored) {}
        }
        throw last;
    }

    private void read(BluetoothSocket s, InputStream in) {
        new Thread(() -> {
            byte[] buf = new byte[1024];
            try {
                int n;
                while ((n = in.read(buf)) > 0) {
                    JSObject o = new JSObject();
                    o.put("value", new String(buf, 0, n, StandardCharsets.ISO_8859_1));
                    notifyListeners("data", o);
                }
            } catch (IOException ignored) {}
            if (s == socket) { close(); notifyListeners("disconnected", new JSObject()); } // no si se cerró a propósito
        }, "elm327-classic").start();
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            if (out == null) throw new IOException("Sin conexión con el adaptador");
            out.write(call.getString("value", "").getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        close();
        call.resolve();
    }

    private void close() {
        BluetoothSocket s = socket;
        socket = null;
        out = null;
        if (s != null) try { s.close(); } catch (IOException ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        close();
    }
}
