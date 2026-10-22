package com.keiws.poppa;

import android.app.ActivityManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Poppa som app: helskärm (systemfälten dolda, de glider fram en stund vid
// svep från kanten), bakåt gör ingenting, appen fäster sig själv
// (skärmfästning). Appen går både stående och liggande och följer
// plattans autorotering (fullUser i AndroidManifest.xml).
public class MainActivity extends BridgeActivity {
    // Fästningen efterfrågas en gång varje gång appen kommer fram (inte igen
    // om man svarat nej, förrän appen lämnats och öppnats igen).
    private boolean fragatFasta = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Bakåtknappen och bakåtsvepet: ingenting, så att barnet inte råkar
        // lämna appen. Hem-knappen fungerar som vanligt.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {}
        });
        // Ända ut, också bakom en kameraurgröpning.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        // Himlen får hela skärmen när fälten är dolda (de som glider fram
        // vid svep ligger ovanpå). Syns fälten ändå (t.ex. när Android visar
        // dem i fäst läge) krymper himlen i stället för att hamna under dem.
        // Ersätter Capacitors SystemBars, som annars kan låta sidan gå under
        // fälten (viewport-fit=cover).
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        doljSystemfalten();
    }

    // Skärmfästning: Android frågar om appen ska fästas. Fäst kan barnet inte
    // lämna appen; den lossas med bakåt + översikt (eller svep upp och håll).
    @Override
    public void onResume() {
        super.onResume();
        ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (!fragatFasta && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            fragatFasta = true;
            try {
                startLockTask();
            } catch (IllegalStateException e) {
                // Går inte just nu: appen fungerar ändå.
            }
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        fragatFasta = false;
    }

    // Fälten döljs igen varje gång appen får tillbaka fokus (efter
    // appväxlaren, skärmlåset eller ett svep).
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) doljSystemfalten();
    }

    private void doljSystemfalten() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
