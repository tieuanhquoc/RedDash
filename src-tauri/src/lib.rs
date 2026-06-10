use serde::{Deserialize, Serialize};
use tauri::Manager;

mod biometric;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedmineRequestArgs {
    method: String,
    url: String,
    api_token: String,
    body: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct RedmineResponse {
    status: u16,
    body: serde_json::Value,
}

fn redact_url(raw: &str) -> String {
    match reqwest::Url::parse(raw) {
        Ok(mut u) => {
            u.set_query(None);
            u.to_string()
        }
        Err(_) => "<invalid-url>".to_string(),
    }
}

#[tauri::command]
async fn redmine_request(args: RedmineRequestArgs) -> Result<RedmineResponse, String> {
    let started = std::time::Instant::now();

    let parsed = reqwest::Url::parse(&args.url).map_err(|e| format!("invalid url: {e}"))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(format!("scheme not allowed: {}", parsed.scheme()));
    }

    log::info!("[redmine] → {} {}", args.method, redact_url(&args.url));

    let client = reqwest::Client::builder()
        .user_agent("RedmineDashboard/0.1")
        .build()
        .map_err(|e| {
            log::info!("[redmine] ✗ build client: {e}");
            e.to_string()
        })?;

    let method = reqwest::Method::from_bytes(args.method.to_uppercase().as_bytes())
        .map_err(|e| format!("invalid method: {e}"))?;

    let mut req = client
        .request(method, parsed)
        .header("X-Redmine-API-Key", &args.api_token)
        .header("Content-Type", "application/json");

    if let Some(body) = args.body {
        req = req.json(&body);
    }

    let resp = req.send().await.map_err(|e| {
        log::info!("[redmine] ✗ network: {e}");
        e.to_string()
    })?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    let elapsed = started.elapsed().as_millis();
    log::info!("[redmine] ← {} ({} bytes, {}ms)", status, text.len(), elapsed);

    let body: serde_json::Value = if text.is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text))
    };

    Ok(RedmineResponse { status, body })
}

struct TrayTotalItem(tauri::menu::MenuItem<tauri::Wry>);

#[tauri::command]
fn update_tray_total(state: tauri::State<'_, TrayTotalItem>, text: String) -> Result<(), String> {
    state.0.set_text(&text).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(format!("scheme not allowed: {}", parsed.scheme()));
    }
    open::that(parsed.as_str()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            // Ensure app local data dir exists (vault.json lives here).
            let data_dir = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data dir");
            std::fs::create_dir_all(&data_dir).ok();
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_process::init())?;

            // Translucent window background — macOS NSVisualEffectView
            // (closest to Liquid Glass shipped with Tahoe), Windows Mica.
            // The radius parameter rounds the inner blur layer so the
            // floating-app aesthetic (sidebar inset from window edge) reads
            // correctly. The window itself stays a rectangle; the .appShell
            // CSS padding + glass surface alpha sell the "floating" look.
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                    let _ = apply_vibrancy(
                        &win,
                        NSVisualEffectMaterial::HudWindow,
                        Some(NSVisualEffectState::Active),
                        Some(14.0),
                    );
                }
                #[cfg(target_os = "windows")]
                {
                    use window_vibrancy::apply_mica;
                    let _ = apply_mica(&win, None);
                }
            }
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                    ])
                    .build(),
            )?;

            // Menu bar tray icon — always visible. Left click opens menu
            // (consistent across macOS / Windows / Linux).
            {
                use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::{Emitter, Manager};

                // Top label shows today's total (updated from JS via the
                // `update_tray_total` command). Disabled so it acts as a header.
                // TODO: Migrate these static tray menu labels to dynamic localized strings if/when Tauri tray i18n support is established.
                let total_item = MenuItemBuilder::with_id("tray_total", "Hôm nay: —")
                    .enabled(false)
                    .build(app)?;
                let quick_log = MenuItemBuilder::with_id("tray_quick_log", "Log time nhanh…").build(app)?;
                let open_dash = MenuItemBuilder::with_id("tray_open_dash", "Mở dashboard").build(app)?;
                let quit_item = MenuItemBuilder::with_id("tray_quit", "Đóng ứng dụng").build(app)?;
                let tray_menu = Menu::with_items(
                    app,
                    &[
                        &total_item,
                        &PredefinedMenuItem::separator(app)?,
                        &quick_log,
                        &open_dash,
                        &PredefinedMenuItem::separator(app)?,
                        &quit_item,
                    ],
                )?;

                app.manage(TrayTotalItem(total_item.clone()));

                let _tray = TrayIconBuilder::with_id("main-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .icon_as_template(false)
                    .tooltip("RedDash")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "tray_quick_log" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                            let _ = app.emit("tray://quick-log", ());
                        }
                        "tray_open_dash" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                            let _ = app.emit("tray://open-dashboard", ());
                        }
                        "tray_quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }

            {
                use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

                let menu = Menu::default(app.handle())?;

                // Help submenu — always available
                let about_author = MenuItemBuilder::with_id("about_author", "Tác giả: Tieu Anh Quoc")
                    .enabled(false)
                    .build(app)?;
                let open_homepage = MenuItemBuilder::with_id("open_homepage", "Trang cá nhân (tieuanhquoc.info)")
                    .build(app)?;
                let open_github = MenuItemBuilder::with_id("open_github", "GitHub Repository")
                    .build(app)?;
                let check_update = MenuItemBuilder::with_id("check_update", "Kiểm tra cập nhật…")
                    .build(app)?;
                let help = SubmenuBuilder::new(app, "Help")
                    .item(&about_author)
                    .item(&PredefinedMenuItem::separator(app)?)
                    .item(&check_update)
                    .item(&PredefinedMenuItem::separator(app)?)
                    .item(&open_homepage)
                    .item(&open_github)
                    .build()?;
                menu.append(&help)?;

                #[cfg(debug_assertions)]
                {
                    let reload = MenuItemBuilder::with_id("dev_reload", "Reload")
                        .accelerator("CmdOrCtrl+R")
                        .build(app)?;
                    let inspect = MenuItemBuilder::with_id("dev_inspect", "Toggle DevTools")
                        .accelerator("CmdOrCtrl+Shift+I")
                        .build(app)?;
                    let develop = SubmenuBuilder::new(app, "Develop")
                        .item(&reload)
                        .item(&inspect)
                        .build()?;
                    menu.append(&develop)?;
                }

                app.set_menu(menu)?;
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Some(win) = app.get_webview_window("main") {
                match event.id().as_ref() {
                    "dev_reload" => { let _ = win.eval("location.reload()"); }
                    "dev_inspect" => {
                        #[cfg(debug_assertions)]
                        {
                            if win.is_devtools_open() { win.close_devtools(); }
                            else { win.open_devtools(); }
                        }
                    }
                    "open_homepage" => { let _ = open::that("https://tieuanhquoc.info/"); }
                    "open_github" => { let _ = open::that("https://github.com/tieuanhquoc/RedDash"); }
                    "check_update" => { let _ = win.eval("window.__rdash_check_update__ && window.__rdash_check_update__(true)"); }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            redmine_request,
            open_url,
            update_tray_total,
            get_native_bg_colors,
            biometric::biometric_available,
            biometric::biometric_is_enabled,
            biometric::biometric_enroll,
            biometric::biometric_unlock,
            biometric::biometric_get_key_silent,
            biometric::biometric_disable,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: dock click while all windows hidden → re-show main window.
            // Triggered when "Chạy nền khi đóng cửa sổ" hid the window.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = &event {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            let _ = (app, event);
        });
}

// ===========================================================================
// Native macOS theme colors
// ===========================================================================
//
// NSColor has many semantic colors that adapt to the user's appearance
// (light/dark) and accessibility settings (Increase Contrast, Reduce
// Transparency, etc.). The web layer can't read them directly — WebKit
// has no bridge to AppKit semantic colors. These commands read the
// RGBA components (0.0–1.0) from Rust and return them so the frontend
// can paint surfaces that match what the OS shows.
//
// CGColor path:
//   1. `[NSColor <name>]`              → NSColor
//   2. `[color CGColor]`               → CGColorRef (Core Foundation)
//   3. `CGColorGetComponents`          → rgba (CGFloat array)

#[cfg(target_os = "macos")]
fn read_nscolor(name: &str) -> [f64; 4] {
    use objc2::class;
    use objc2::runtime::{AnyObject, MessageReceiver, Sel};
    use std::ffi::CString;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGColorGetNumberOfComponents(c: *const AnyObject) -> usize;
        fn CGColorGetComponents(c: *const AnyObject, components: *mut f64);
    }

    let color_class = class!(NSColor);
    let sel_name = CString::new(name).unwrap();
    let sel: Sel = Sel::register(sel_name.as_c_str());
    // Dispatch the dynamic selector through the runtime — `msg_send![..., sel: sel]`
    // would send a literal selector named `sel:` instead of the one in `sel`.
    let ns_color: *mut AnyObject = unsafe {
        MessageReceiver::send_message(color_class, sel, ())
    };
    if ns_color.is_null() {
        return [0.0, 0.0, 0.0, 1.0];
    }
    let cg_color: *mut AnyObject = unsafe { objc2::msg_send![ns_color, CGColor] };
    if cg_color.is_null() {
        return [0.0, 0.0, 0.0, 1.0];
    }
    let mut rgba: [f64; 4] = [0.0, 0.0, 0.0, 1.0];
    let count = unsafe { CGColorGetNumberOfComponents(cg_color) };
    if count >= 3 {
        unsafe { CGColorGetComponents(cg_color, rgba.as_mut_ptr()); }
    }
    if count == 3 {
        rgba[3] = 1.0;
    }
    rgba
}

/// Returns two semantic macOS background colors as RGBA floats:
/// - `control_bg`     — base app surface (sidebar, modal, panels).
///   Uses `NSColor.controlBackgroundColor`, the semantic color for
///   controls. Typically 1–2 stops lighter than `textBackgroundColor`
///   in dark mode, which keeps glass surfaces from going pitch black.
/// - `under_page_bg`  — content cards (calendar, summary, list rows).
///   Uses `NSColor.underPageBackgroundColor`, the "page" tone — slightly
///   lighter than control in dark mode so cards read as raised above
///   the sidebar.
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_native_bg_colors() -> [[f64; 4]; 2] {
    [
        read_nscolor("controlBackgroundColor"),
        read_nscolor("underPageBackgroundColor"),
    ]
}
