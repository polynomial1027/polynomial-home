use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::{SystemTime, UNIX_EPOCH, Duration}};
use tauri::{Manager, AppHandle, State};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task { id: String, title: String, due_epoch_ms: u64 }
#[derive(Default, Serialize, Deserialize)]
struct Preferences { enabled: bool, user_id: String, items: Vec<Task>, sent: Vec<String> }
pub struct ReminderState { data: Mutex<Preferences>, file: PathBuf }
fn persist(state: &ReminderState, data: &Preferences) -> Result<(), String> {
    if let Some(parent) = state.file.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let temp = state.file.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec(data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&temp, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?; }
    // Windows rename cannot replace an existing target.
    if state.file.exists() { fs::remove_file(&state.file).map_err(|e| e.to_string())?; }
    fs::rename(temp, &state.file).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn sync_reminders(state: State<ReminderState>, user_id: String, items: Vec<Task>, enabled: bool) -> Result<(), String> {
    if user_id.len() > 100 || items.len() > 100 || items.iter().any(|item| item.id.len() > 100 || item.title.len() > 600) { return Err("提醒数据无效".into()); }
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    if data.user_id != user_id { data.sent.clear(); }
    data.user_id = user_id; data.items = items; data.enabled = enabled;
    persist(&state, &data)
}
#[tauri::command]
pub fn clear_reminders(state: State<ReminderState>) -> Result<(), String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    *data = Preferences::default(); persist(&state, &data)
}
pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let file = app.path().app_local_data_dir()?.join("reminders.json");
    let data = fs::read(&file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    app.manage(ReminderState { data: Mutex::new(data), file });
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(10));
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        let state = handle.state::<ReminderState>();
        if let Ok(mut data) = state.data.lock() {
            if !data.enabled { continue; }
            let tasks = data.items.clone(); let mut changed = false;
            for item in tasks {
                let key = format!("{}:{}:{}", data.user_id, item.id, item.due_epoch_ms);
                if item.due_epoch_ms > now || now - item.due_epoch_ms > 86400000 || data.sent.contains(&key) { continue; }
                let title = if now - item.due_epoch_ms > 300000 { "补发日程提醒" } else { "日程提醒" };
                if handle.notification().builder().title(title).body(&item.title).show().is_ok() { data.sent.push(key); changed = true; }
            }
            if changed { if data.sent.len() > 500 { let remove = data.sent.len() - 500; data.sent.drain(..remove); } let _ = persist(&state, &data); }
        };
    });
    Ok(())
}
