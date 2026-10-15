#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, menu::{Menu, MenuItem, Submenu, PredefinedMenuItem, AboutMetadata}};
use tauri_plugin_opener::OpenerExt;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
mod reminders;
struct TrayAvailable(bool);
const SERVER: &str = "https://polynomial-server.tail722ac8.ts.net";
fn platform() -> &'static str { if cfg!(target_os="macos") {"mac"} else if cfg!(target_os="windows") {"windows"} else {"linux"} }
fn arch() -> &'static str { if cfg!(target_arch="aarch64") {"arm64"} else {"x64"} }
fn main() {
 tauri::Builder::default()
  .plugin(tauri_plugin_opener::init())
  .plugin(tauri_plugin_notification::init())
  .invoke_handler(tauri::generate_handler![reminders::sync_reminders, reminders::clear_reminders])
  .setup(|app| {
   let version=app.package_info().version.to_string();
   let home=MenuItem::with_id(app,"home","个人空间",true,None::<&str>)?;
   let reload=MenuItem::with_id(app,"reload","重新连接 / 刷新",true,Some("CmdOrCtrl+R"))?;
   let updates=MenuItem::with_id(app,"updates","检查软件更新",true,None::<&str>)?;
   let about=PredefinedMenuItem::about(app,None,Some(AboutMetadata{name:Some("Polynomial".into()),version:Some(version.clone()),short_version:Some(version.clone()),..Default::default()}))?;
   let quit=PredefinedMenuItem::quit(app,None)?;
   let primary=Submenu::with_items(app,"Polynomial",true,&[&home,&reload,&updates,&about,&quit])?;
   let edit=Submenu::with_items(app,"编辑",true,&[&PredefinedMenuItem::undo(app,None)?,&PredefinedMenuItem::redo(app,None)?,&PredefinedMenuItem::cut(app,None)?,&PredefinedMenuItem::copy(app,None)?,&PredefinedMenuItem::paste(app,None)?,&PredefinedMenuItem::select_all(app,None)?])?;
   app.set_menu(Menu::with_items(app,&[&primary,&edit])?)?;
   reminders::start(app.handle())?;
   let show=MenuItem::with_id(app,"show","打开 Polynomial",true,None::<&str>)?;
   let tray_quit=MenuItem::with_id(app,"tray-quit","退出并停止提醒",true,None::<&str>)?;
   let tray_menu=Menu::with_items(app,&[&show,&tray_quit])?;
   let tray=TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Polynomial · 日程提醒运行中").menu(&tray_menu).show_menu_on_left_click(false)
    .on_menu_event(|app,event| match event.id().as_ref() { "show"=>{if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.unminimize();let _=window.set_focus();}}, "tray-quit"=>app.exit(0), _=>{} })
    .on_tray_icon_event(|tray,event|{if let TrayIconEvent::Click { button:MouseButton::Left, button_state:MouseButtonState::Up, .. }=event {if let Some(window)=tray.app_handle().get_webview_window("main"){let _=window.show();let _=window.set_focus();}}}).build(app);
   app.manage(TrayAvailable(tray.is_ok()));
   let handle=app.handle().clone();
   let agent=format!("Mozilla/5.0 PolynomialClient/{} ({}; {})",version,platform(),arch());
   WebviewWindowBuilder::new(app,"main",WebviewUrl::External(format!("{}/app.html",SERVER).parse()?))
    .title("Polynomial").inner_size(1280.0,850.0).min_inner_size(420.0,600.0)
    .user_agent(&agent).disable_drag_drop_handler()
    .on_navigation(move |url| {
     let same=url.scheme()=="https"&&url.host_str()==Some("polynomial-server.tail722ac8.ts.net")&&url.port_or_known_default()==Some(443)&&url.username().is_empty()&&url.password().is_none();
     // Public installers use the system browser's download manager on every OS.
     if same && url.path().starts_with("/api/downloads/") && url.path().ends_with("/content") { let _=handle.opener().open_url(url.to_string(),None::<&str>); return false; }
     if !same && ["https","mailto"].contains(&url.scheme()) { let _=handle.opener().open_url(url.to_string(),None::<&str>); }
     same
    }).build()?;
   Ok(())
  })
  .on_window_event(|window,event| { if let tauri::WindowEvent::CloseRequested { api, .. }=event { if window.app_handle().state::<TrayAvailable>().0 { api.prevent_close(); let _=window.hide(); } } })
  .on_menu_event(|app,event| {
   if let Some(window)=app.get_webview_window("main") {
    let url=match event.id().as_ref() {
     "home"|"reload"=>format!("{}/app.html",SERVER),
     "updates"=>format!("{}/download.html?installed={}&platform={}&arch={}",SERVER,app.package_info().version,platform(),arch()),
     _=>return,
    };
    if let Ok(url)=url.parse(){let _=window.navigate(url);}
   }
  }).run(tauri::generate_context!()).expect("Polynomial client could not start");
}
