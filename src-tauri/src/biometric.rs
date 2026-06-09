// Biometric-gated random key for vault unlock.
//
// macOS:   Touch ID via robius-authentication + Keychain via `keyring` crate.
// Windows: Windows Hello via robius-authentication + Credential Manager via `keyring`.
// Linux:   stubs return "unsupported".
//
// On dev rebuilds the binary signature changes, so macOS prompts for the user's
// login password to authorize keychain access. That's expected.

const SERVICE: &str = "RedDash";
const ACCOUNT: &str = "vault-bio-key";

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod imp {
    use super::{ACCOUNT, SERVICE};
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use keyring::Entry;
    use robius_authentication::{
        AndroidText, BiometricStrength, Context, PolicyBuilder, Text, WindowsText,
    };

    fn entry() -> Result<Entry, String> {
        Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
    }

    fn verify(reason: &str) -> Result<(), String> {
        let policy = PolicyBuilder::new()
            .biometrics(Some(BiometricStrength::Strong))
            .password(true)
            .watch(true)
            .build()
            .ok_or_else(|| "could not build auth policy".to_string())?;
        let text = Text {
            android: AndroidText { title: reason, subtitle: None, description: None },
            apple: reason,
            windows: WindowsText::new("RedDash", reason)
                .ok_or_else(|| "could not build windows auth text".to_string())?,
        };
        Context::new(())
            .blocking_authenticate(text, &policy)
            .map_err(|e| format!("auth failed: {e:?}"))
    }

    fn random_key_b64() -> Result<String, String> {
        let mut buf = [0u8; 32];
        getrandom::fill(&mut buf).map_err(|e| format!("rand: {e}"))?;
        Ok(B64.encode(buf))
    }

    pub fn available() -> bool { true }

    pub fn is_enabled() -> bool {
        entry()
            .and_then(|e| e.get_password().map_err(|e| e.to_string()))
            .is_ok()
    }

    pub fn enroll() -> Result<String, String> {
        verify("Xác thực để bật mở khoá bằng sinh trắc học")?;
        // Force-delete any prior entry. Without this, keyring's set_password
        // on macOS would UPDATE an existing entry — preserving any biometric
        // ACL set by older code paths, which then refuses reads (-25293).
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("/usr/bin/security")
                .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
                .output();
        }
        let _ = disable();
        let key = random_key_b64()?;
        entry()?.set_password(&key).map_err(|e| e.to_string())?;
        Ok(key)
    }

    pub fn unlock() -> Result<String, String> {
        verify("Mở khoá RedDash")?;
        entry()?.get_password().map_err(|e| e.to_string())
    }

    pub fn get_key_silent() -> Result<Option<String>, String> {
        match entry()?.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn disable() -> Result<(), String> {
        let result = entry().and_then(|e| match e.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        });

        #[cfg(target_os = "macos")]
        if result.is_err() {
            let _ = std::process::Command::new("/usr/bin/security")
                .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
                .output();
            return Ok(());
        }
        result
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    pub fn available() -> bool { false }
    pub fn is_enabled() -> bool { false }
    pub fn enroll() -> Result<String, String> {
        Err("biometric not supported on this platform".into())
    }
    pub fn unlock() -> Result<String, String> {
        Err("biometric not supported on this platform".into())
    }
    pub fn get_key_silent() -> Result<Option<String>, String> { Ok(None) }
    pub fn disable() -> Result<(), String> { Ok(()) }
}

#[tauri::command]
pub fn biometric_available() -> bool { imp::available() }

#[tauri::command]
pub fn biometric_is_enabled() -> bool { imp::is_enabled() }

#[tauri::command]
pub async fn biometric_enroll() -> Result<String, String> {
    tokio::task::spawn_blocking(imp::enroll)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn biometric_unlock() -> Result<String, String> {
    tokio::task::spawn_blocking(imp::unlock)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn biometric_get_key_silent() -> Result<Option<String>, String> {
    imp::get_key_silent()
}

#[tauri::command]
pub fn biometric_disable() -> Result<(), String> {
    imp::disable()
}
