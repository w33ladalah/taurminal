use std::process::Command as StdCommand;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::{command, AppHandle, Manager};

// Global state to track current directory
static CURRENT_DIR: Lazy<Mutex<PathBuf>> = Lazy::new(|| {
    let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));
    Mutex::new(PathBuf::from(home_dir))
});

#[command]
pub fn execute_command(command: String, app_handle: AppHandle) -> Result<String, String> {
    println!("Executing command: {}", command);

    // Handle exit command
    if command.trim() == "exit" {
        // Give a moment for the final output to be displayed
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(100));
            app_handle.exit(0);
        });
        return Ok("Exiting...".to_string());
    }

    // Get current directory
    let current_dir = CURRENT_DIR.lock().unwrap().clone();

    // Check if this is a cd command
    if command.trim().starts_with("cd ") {
        return handle_cd_command(&command, &current_dir);
    }

    let output = StdCommand::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&current_dir)
        .output()
        .map_err(|e| {
            println!("Command error: {}", e);
            e.to_string()
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Command status: {}", output.status);
    println!("Command stdout: {}", stdout);
    println!("Command stderr: {}", stderr);

    if output.status.success() {
        Ok(stdout)
    } else {
        if !stderr.is_empty() {
            Err(stderr)
        } else {
            Err(format!("Command failed with status: {}", output.status))
        }
    }
}

fn handle_cd_command(command: &str, current_dir: &Path) -> Result<String, String> {
    // Extract the target directory
    let parts: Vec<&str> = command.trim().splitn(2, ' ').collect();
    if parts.len() < 2 {
        // If just "cd" with no args, go to home directory
        let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));
        *CURRENT_DIR.lock().unwrap() = PathBuf::from(&home_dir);
        return Ok(format!("Changed directory to {}", home_dir));
    }

    let target_dir = parts[1].trim();

    // Handle special cases
    let new_dir = if target_dir == "~" || target_dir == "" {
        let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));
        PathBuf::from(home_dir)
    } else if target_dir.starts_with("~/") {
        let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));
        let without_tilde = &target_dir[2..];
        PathBuf::from(format!("{}/{}", home_dir, without_tilde))
    } else if target_dir.starts_with("/") {
        // Absolute path
        PathBuf::from(target_dir)
    } else {
        // Relative path
        let mut new_path = current_dir.to_path_buf();
        new_path.push(target_dir);
        new_path
    };

    // Check if directory exists
    if !new_dir.is_dir() {
        return Err(format!("cd: no such directory: {}", target_dir));
    }

    // Update current directory
    let canonical_path = new_dir.canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;

    *CURRENT_DIR.lock().unwrap() = canonical_path.clone();

    // Return empty string for success (no output for cd command)
    Ok(String::new())
}

#[command]
pub fn get_current_directory() -> String {
    CURRENT_DIR.lock().unwrap().to_string_lossy().to_string()
}

#[command]
pub fn get_completion_suggestions(
    partial_command: String,
    full_command: String
) -> Result<Vec<String>, String> {
    // Get current directory
    let current_dir = CURRENT_DIR.lock().unwrap().clone();

    let words: Vec<&str> = full_command.trim().split_whitespace().collect();

    // If it's the first word, complete with commands
    if words.len() <= 1 {
        // Use bash's built-in completion for commands
        let completion_cmd = format!("compgen -c {} | sort | uniq", partial_command);

        let output = StdCommand::new("bash")
            .arg("-c")
            .arg(&completion_cmd)
            .current_dir(&current_dir)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        // Parse suggestions
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let suggestions: Vec<String> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();

        Ok(suggestions)
    } else {
        // Complete file paths
        let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));
        let completion_cmd;

        // Check if the partial path starts with ~/
        if partial_command.starts_with("~/") {
            let expanded_path = partial_command.replace("~", &home_dir);
            completion_cmd = format!("compgen -f {} | sort", expanded_path);
        } else {
            completion_cmd = format!("compgen -f {} | sort", partial_command);
        }

        let output = StdCommand::new("bash")
            .arg("-c")
            .arg(&completion_cmd)
            .current_dir(&current_dir)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        // Parse suggestions
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let mut suggestions: Vec<String> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                // Replace home directory with ~ for display
                if line.starts_with(&home_dir) {
                    line.replace(&home_dir, "~")
                } else {
                    line.to_string()
                }
            })
            .collect();

        // If no file suggestions, try directory suggestions
        if suggestions.is_empty() {
            let completion_cmd = format!("compgen -d {} | sort", partial_command);

            let output = StdCommand::new("bash")
                .arg("-c")
                .arg(&completion_cmd)
                .current_dir(&current_dir)
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                suggestions = stdout
                    .lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| format!("{}/", line)) // Add trailing slash for directories
                    .collect();
            }
        }

        Ok(suggestions)
    }
}
