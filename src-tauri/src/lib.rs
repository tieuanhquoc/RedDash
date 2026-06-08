use serde::{Deserialize, Serialize};
use tauri::Manager;

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
            // Stronghold needs a persistent salt path for Argon2 key derivation.
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data dir")
                .join("salt.txt");
            std::fs::create_dir_all(salt_path.parent().unwrap()).ok();
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_process::init())?;
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build(),
            )?;
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
        .invoke_handler(tauri::generate_handler![redmine_request, open_url]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
