package com.kivo.messenger;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String CHANNEL_ID = "kivo_messages";
    private static final String CHANNEL_NAME = "KIVO Messages";
    private static final String CHANNEL_DESCRIPTION = "Incoming chat message notifications";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    /**
     * Create the KIVO Messages notification channel with custom sound.
     *
     * Must be created before any notification is posted (Android 8.0+).
     * On API < 26, channels don't exist and notifications use the sound
     * URI set at the individual notification level.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.enableVibration(true);

        // Custom notification sound from res/raw/kivo_notification.wav
        Uri soundUri = Uri.parse(
            "android.resource://" + getPackageName() + "/" + R.raw.kivo_notification
        );
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(soundUri, attrs);

        NotificationManager manager = ContextCompat.getSystemService(
            this, NotificationManager.class
        );
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
