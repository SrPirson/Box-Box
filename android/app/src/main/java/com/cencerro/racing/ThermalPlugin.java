package com.cencerro.racing;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Temperatura del móvil: Android no da la de la CPU a las apps, pero sí la de la batería (décimas de °C).
// Es la que sube con sol directo en el salpicadero y la que hace que el sistema recorte o apague el móvil.
@CapacitorPlugin(name = "Thermal")
public class ThermalPlugin extends Plugin {
    @PluginMethod
    public void read(PluginCall call) {
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int tenths = battery == null ? Integer.MIN_VALUE : battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        if (tenths == Integer.MIN_VALUE) { call.reject("Temperatura no disponible"); return; }
        JSObject ret = new JSObject();
        ret.put("celsius", tenths / 10.0);
        call.resolve(ret);
    }
}
