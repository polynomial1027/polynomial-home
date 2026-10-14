package com.polynomial.server;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import org.json.*;

public final class Reminders extends BroadcastReceiver {
    private static final String CHANNEL = "planner";
    private static final String PREFS = "planner-reminders";
    private final MainActivity activity;
    public Reminders() { activity = null; }
    Reminders(MainActivity activity) { this.activity = activity; }
    private static android.content.SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static PendingIntent pending(Context context, String id, String title, int flags) {
        Intent intent = new Intent(context, Reminders.class).setData(Uri.parse("polynomial://planner/" + id)).putExtra("title", title).putExtra("id", id);
        return PendingIntent.getBroadcast(context, 0, intent, flags | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void channel(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "日程提醒", NotificationManager.IMPORTANCE_DEFAULT));
    }
    private static void cancel(Context context, JSONArray tasks) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject row = tasks.optJSONObject(i); if (row == null) continue;
            String id = row.optString("id");
            if (!id.matches("[a-f0-9-]{36}")) continue;
            PendingIntent existing = pending(context, id, "", PendingIntent.FLAG_NO_CREATE);
            if (existing != null) { alarms.cancel(existing); existing.cancel(); }
        }
    }
    private static JSONArray saved(Context context) {
        try { return new JSONArray(prefs(context).getString("items", "[]")); } catch (Exception ignored) { return new JSONArray(); }
    }
    private static void schedule(Context context, JSONArray tasks) {
        channel(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int i = 0; i < Math.min(100, tasks.length()); i++) {
            JSONObject row = tasks.optJSONObject(i); if (row == null) continue;
            String id = row.optString("id"), title = row.optString("title");
            if (!id.matches("[a-f0-9-]{36}") || title.isEmpty() || title.length() > 120) continue;
            long due;
            try { due = java.time.Instant.parse(row.optString("dueAt")).toEpochMilli(); } catch (Exception ignored) { continue; }
            if (due <= System.currentTimeMillis()) continue;
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pending(context, id, title, PendingIntent.FLAG_UPDATE_CURRENT));
        }
    }
    private static boolean permitted(Context context) {
        return Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
    @JavascriptInterface public boolean enabled() { return activity != null && prefs(activity).getBoolean("enabled", false) && permitted(activity); }
    @JavascriptInterface public void sync(String json) {
        if (activity == null || json == null || json.length() > 25_000) return;
        activity.runOnUiThread(() -> update(json, false));
    }
    @JavascriptInterface public void enable(String json) {
        if (activity == null || json == null || json.length() > 25_000) return;
        activity.runOnUiThread(() -> update(json, true));
    }
    private void update(String json, boolean requested) {
        try {
            JSONObject data = new JSONObject(json);
            String userId = data.optString("userId");
            JSONArray tasks = data.optJSONArray("items");
            if (!userId.matches("[a-f0-9-]{36}") || tasks == null || tasks.length() > 100) return;
            if (requested && !permitted(activity)) activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 202);
            if (!requested && !prefs(activity).getBoolean("enabled", false)) return;
            cancel(activity, saved(activity));
            prefs(activity).edit().putString("userId", userId).putString("items", tasks.toString()).putBoolean("enabled", true).apply();
            if (permitted(activity)) schedule(activity, tasks);
        } catch (Exception ignored) {}
    }
    @JavascriptInterface public void disable() {
        if (activity == null) return;
        activity.runOnUiThread(() -> { cancel(activity, saved(activity)); prefs(activity).edit().clear().apply(); });
    }
    static void permissionResult(Context context) { if (permitted(context) && prefs(context).getBoolean("enabled", false)) schedule(context, saved(context)); }
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) { if (prefs(context).getBoolean("enabled", false) && permitted(context)) schedule(context, saved(context)); return; }
        if (!permitted(context) || !prefs(context).getBoolean("enabled", false)) return;
        String id = intent.getStringExtra("id");
        if (id == null || !id.matches("[a-f0-9-]{36}")) return;
        boolean current = false; JSONArray tasks = saved(context);
        for (int i = 0; i < tasks.length(); i++) { JSONObject row = tasks.optJSONObject(i); if (row != null && id.equals(row.optString("id"))) { current = true; break; } }
        if (!current) return;
        channel(context);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.app_icon).setContentTitle("日程提醒").setContentText(intent.getStringExtra("title")).setAutoCancel(true).setContentIntent(tap).build();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id.hashCode(), notification);
    }
}
