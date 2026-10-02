package com.cencerro.racing;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThermalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
