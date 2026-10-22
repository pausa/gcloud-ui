use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use tokio::process::Command;

#[derive(Serialize)]
pub struct JobRow {
    pub name: String,
    pub region: String,
    /// Initial run info from "latestCreatedExecution" (no extra gcloud call).
    pub details: JobDetails,
}

#[derive(Serialize)]
pub struct JobDetails {
    pub exit_code: Option<i32>,
    pub last_run: Option<String>,
    pub duration_secs: Option<f64>,
}

fn duration_secs(start: Option<&str>, completion: Option<&str>) -> Option<f64> {
    let start = start.and_then(parse_time);
    let completion = completion.and_then(parse_time);
    match (start, completion) {
        (Some(s), Some(c)) => Some((c - s).num_milliseconds() as f64 / 1000.0),
        _ => None,
    }
}

async fn run_gcloud(args: &[String]) -> Result<String, String> {
    let output = Command::new("gcloud")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("failed to run gcloud: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "gcloud {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_time(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

/// Read the region of a Cloud Run entity from its list JSON.
fn entity_region(entity: &Value) -> String {
    entity["metadata"]["labels"]["cloud.googleapis.com/location"]
        .as_str()
        .or_else(|| {
            entity["metadata"]["annotations"]["run.googleapis.com/location"].as_str()
        })
        .unwrap_or_default()
        .to_string()
}

async fn current_project() -> Result<String, String> {
    let out = run_gcloud(&[
        "config".into(),
        "get-value".into(),
        "project".into(),
    ])
    .await?;
    let project = out.trim().to_string();
    if project.is_empty() {
        return Err("no gcloud project configured".into());
    }
    Ok(project)
}

fn open_in_browser(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open browser: {e}"))
}

/// Map the ExecutionReference completion status (v1 API) to an exit code.
fn completion_status_to_exit_code(status: Option<&str>) -> Option<i32> {
    match status? {
        s if s.ends_with("SUCCEEDED") => Some(0),
        s if s.ends_with("FAILED") => Some(1),
        _ => None,
    }
}

/// Extract the exit code of the last execution: prefer the reported
/// container exit code, fall back to the "Succeeded" condition.
fn extract_exit_code(exec: &Value) -> Option<i32> {
    if let Some(code) = exec["status"]["containerStatuses"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|c| c["exitCode"].as_i64())
    {
        return Some(code as i32);
    }
    let succeeded = exec["status"]["conditions"]
        .as_array()?
        .iter()
        .find(|c| c["type"].as_str() == Some("Succeeded"))
        .and_then(|c| c["status"].as_str())
        .map(|s| s == "True")?;
    Some(if succeeded { 0 } else { 1 })
}

async fn last_execution(job: &str, region: &str) -> Result<Option<Value>, String> {
    let mut args: Vec<String> = [
        "run",
        "jobs",
        "executions",
        "list",
        "--job",
        job,
        "--limit",
        "1",
        "--format=json",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if !region.is_empty() {
        args.extend(["--region".to_string(), region.to_string()]);
    }
    let out = run_gcloud(&args).await?;
    let execs: Vec<Value> =
        serde_json::from_str(&out).map_err(|e| format!("failed to parse executions: {e}"))?;
    Ok(execs.into_iter().next())
}

pub async fn list_jobs() -> Result<Vec<JobRow>, String> {
    let out = run_gcloud(&[
        "run".into(),
        "jobs".into(),
        "list".into(),
        "--format=json".into(),
    ])
    .await?;
    let jobs: Vec<Value> =
        serde_json::from_str(&out).map_err(|e| format!("failed to parse jobs: {e}"))?;

    let rows = jobs
        .iter()
        .filter_map(|job| {
            let name = job["metadata"]["name"].as_str()?;
            if name.is_empty() {
                return None;
            }
            let region = job["metadata"]["labels"]["cloud.googleapis.com/location"]
                .as_str()
                .or_else(|| {
                    job["metadata"]["annotations"]["run.googleapis.com/location"]
                        .as_str()
                })
                .unwrap_or_default()
                .to_string();
            let latest = &job["status"]["latestCreatedExecution"];
            // In the v1 list output the ExecutionReference has no startTime;
            // creationTimestamp is what gcloud itself displays as last run.
            let start = latest["creationTimestamp"].as_str();
            Some(JobRow {
                name: name.to_string(),
                region,
                details: JobDetails {
                    exit_code: completion_status_to_exit_code(latest["completionStatus"].as_str()),
                    last_run: start.map(String::from),
                    duration_secs: duration_secs(start, latest["completionTimestamp"].as_str()),
                },
            })
        })
        .collect();
    Ok(rows)
}

/// Open the Cloud Console page of a job in the system browser.
pub async fn open_job_in_console(name: &str, region: &str) -> Result<(), String> {
    let project = current_project().await?;
    let url = if region.is_empty() {
        format!(
            "https://console.cloud.google.com/run/jobs?project={project}"
        )
    } else {
        format!(
            "https://console.cloud.google.com/run/jobs/details/{region}/{name}?project={project}"
        )
    };
    open_in_browser(&url)
}

/// Load the run info of the last execution of a job (on demand).
pub async fn job_details(name: &str, region: &str) -> Result<JobDetails, String> {
    match last_execution(name, region).await? {
        Some(exec) => {
            let start = exec["status"]["startTime"].as_str();
            Ok(JobDetails {
                exit_code: extract_exit_code(&exec),
                last_run: start.map(String::from),
                duration_secs: duration_secs(start, exec["status"]["completionTime"].as_str()),
            })
        }
        None => Ok(JobDetails {
            exit_code: None,
            last_run: None,
            duration_secs: None,
        }),
    }
}

#[derive(Serialize)]
pub struct ServiceRow {
    pub name: String,
    pub region: String,
    /// Health from the "Ready" condition: Some(true) = healthy,
    /// Some(false) = unhealthy, None = unknown.
    pub ready: Option<bool>,
}

pub async fn list_services() -> Result<Vec<ServiceRow>, String> {
    let out = run_gcloud(&[
        "run".into(),
        "services".into(),
        "list".into(),
        "--format=json".into(),
    ])
    .await?;
    let services: Vec<Value> =
        serde_json::from_str(&out).map_err(|e| format!("failed to parse services: {e}"))?;

    let rows = services
        .iter()
        .filter_map(|svc| {
            let name = svc["metadata"]["name"].as_str()?;
            if name.is_empty() {
                return None;
            }
            let ready = svc["status"]["conditions"]
                .as_array()
                .and_then(|cs| {
                    cs.iter()
                        .find(|c| c["type"].as_str() == Some("Ready"))
                        .and_then(|c| c["status"].as_str())
                })
                .and_then(|s| match s {
                    "True" => Some(true),
                    "False" => Some(false),
                    _ => None,
                });
            Some(ServiceRow {
                name: name.to_string(),
                region: entity_region(svc),
                ready,
            })
        })
        .collect();
    Ok(rows)
}

/// Redeploy a service: fetch its current image and run
/// `gcloud run deploy` with it, which creates a new revision.
/// (`services update` with no changes creates no new revision.)
pub async fn redeploy_service(name: &str, region: &str) -> Result<(), String> {
    let mut describe: Vec<String> = ["run", "services", "describe", name, "--format=json"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if !region.is_empty() {
        describe.extend(["--region".to_string(), region.to_string()]);
    }
    let out = run_gcloud(&describe).await?;
    let svc: Value =
        serde_json::from_str(&out).map_err(|e| format!("failed to parse service: {e}"))?;
    let image = svc["spec"]["template"]["spec"]["containers"][0]["image"]
        .as_str()
        .ok_or("service has no container image")?
        .to_string();

    let mut deploy: Vec<String> = [
        "run",
        "deploy",
        name,
        "--image",
        &image,
        "--quiet",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if !region.is_empty() {
        deploy.extend(["--region".to_string(), region.to_string()]);
    }
    run_gcloud(&deploy).await?;
    Ok(())
}

/// Open the Cloud Console page of a service in the system browser.
pub async fn open_service_in_console(name: &str, region: &str) -> Result<(), String> {
    let project = current_project().await?;
    let url = if region.is_empty() {
        format!(
            "https://console.cloud.google.com/run?project={project}"
        )
    } else {
        format!(
            "https://console.cloud.google.com/run/detail/{region}/{name}?project={project}"
        )
    };
    open_in_browser(&url)
}
