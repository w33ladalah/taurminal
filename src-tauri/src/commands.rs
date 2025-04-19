use std::process::Command as StdCommand;
use std::env;
use tauri::command;

#[command]
pub fn execute_command(command: String) -> Result<String, String> {
    println!("Executing command: {}", command);

    // Get user's home directory
    let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));

    let output = StdCommand::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(home_dir)
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

#[command]
pub fn get_completion_suggestions(partial_command: String) -> Result<Vec<String>, String> {
    // Get user's home directory
    let home_dir = env::var("HOME").unwrap_or_else(|_| String::from("/"));

    // Use bash's built-in completion
    let completion_cmd = format!("compgen -c {} | sort | uniq", partial_command);

    let output = StdCommand::new("bash")
        .arg("-c")
        .arg(&completion_cmd)
        .current_dir(home_dir)
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
}
