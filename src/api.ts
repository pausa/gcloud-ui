import { invoke } from "@tauri-apps/api/core";

export interface JobDetails {
  exit_code: number | null;
  last_run: string | null;
  duration_secs: number | null;
}

export interface JobRow {
  name: string;
  region: string;
  /** Initial run info from "latestCreatedExecution" (no extra gcloud call). */
  details: JobDetails;
}

export async function listJobs(): Promise<JobRow[]> {
  return invoke<JobRow[]>("list_jobs");
}

export async function loadJobDetails(name: string, region: string): Promise<JobDetails> {
  return invoke<JobDetails>("load_job_details", { name, region });
}
