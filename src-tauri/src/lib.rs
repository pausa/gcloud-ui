mod gcloud;

#[tauri::command]
async fn list_jobs() -> Result<Vec<gcloud::JobRow>, String> {
    gcloud::list_jobs().await
}

#[tauri::command]
async fn load_job_details(name: String, region: String) -> Result<gcloud::JobDetails, String> {
    gcloud::job_details(&name, &region).await
}

#[tauri::command]
async fn open_job_in_console(name: String, region: String) -> Result<(), String> {
    gcloud::open_job_in_console(&name, &region).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_jobs,
            load_job_details,
            open_job_in_console
        ])
        .run(tauri::generate_context!())
        .expect("error while running gcloud-ui");
}
