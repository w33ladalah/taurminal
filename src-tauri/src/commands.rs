use std::process::Command as StdCommand;
use tauri::command;

#[command]
pub fn execute_command(command: String) -> Result<String, String> {
    println!("Executing command: {}", command);

    let output = StdCommand::new("sh")
        .arg("-c")
        .arg(&command)
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
