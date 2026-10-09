import { invoke } from "@tauri-apps/api/core";

export interface JobRow {
  name: string;
  region: string;
}

export interface JobDetails {
  exit_code: number | null;
  last_run: string | null;
  duration_secs: number | null;
}

export async function listJobs(): Promise<JobRow[]> {
  return invoke<JobRow[]>("list_jobs");
}

export async function loadJobDetails(name: string, region: string): Promise<JobDetails> {
  return invoke<JobDetails>("load_job_details", { name, region });
}
